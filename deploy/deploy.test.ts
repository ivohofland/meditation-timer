import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * `deploy/deploy.sh` against a real git origin and clone in a temp directory,
 * with `docker` stubbed on PATH. The stub logs each call and "builds" by
 * writing dist/index.html into the mounted source, or fails when asked to.
 */
const SCRIPT = path.resolve(import.meta.dirname, 'deploy.sh')
/** The server and CI have util-linux `flock`; macOS does not, so there it is stubbed. */
const HAS_FLOCK = spawnSync('sh', ['-c', 'command -v flock']).status === 0

let root: string
let work: string
let repo: string
let web: string
let bin: string
let callLog: string

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
  }).trim()
}

function stub(name: string, body: string) {
  const file = path.join(bin, name)
  fs.writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`)
  fs.chmodSync(file, 0o755)
}

/** Commits a change to origin's main and returns the new commit. */
function commit(label: string): string {
  fs.writeFileSync(path.join(work, 'version.txt'), `${label}\n`)
  git(work, 'add', 'version.txt')
  git(work, 'commit', '-q', '-m', label)
  git(work, 'push', '-q', 'origin', 'main')
  return git(work, 'rev-parse', 'HEAD')
}

function deploy(request: string, env: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REPO_DIR: repo,
      WEB_ROOT: web,
      LOCK_FILE: path.join(root, 'lock'),
      SSH_ORIGINAL_COMMAND: request,
      ...env,
    },
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

const current = () => path.basename(fs.readlinkSync(path.join(web, 'current')))
const releases = () => fs.readdirSync(path.join(web, 'releases')).sort()
const calls = () => (fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean) : [])

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'timer-deploy-'))
  const origin = path.join(root, 'origin.git')
  work = path.join(root, 'work')
  repo = path.join(root, 'repo')
  web = path.join(root, 'web')
  bin = path.join(root, 'bin')
  callLog = path.join(root, 'calls.log')
  fs.mkdirSync(bin)
  fs.mkdirSync(web)
  git(root, 'init', '-q', '--bare', '-b', 'main', origin)
  git(root, 'clone', '-q', origin, work)
  git(work, 'checkout', '-q', '-b', 'main')
  fs.writeFileSync(path.join(work, 'package.json'), '{ "packageManager": "pnpm@10.34.8" }\n')
  git(work, 'add', 'package.json')
  commit('first')
  git(root, 'clone', '-q', origin, repo)
  // The mounted source is the -v argument's host side; a build writes dist/ there.
  stub('docker', `
echo "docker $*" >> "${callLog}"
[[ -z "\${DOCKER_FAIL:-}" ]] || exit 1
src=""; prev=""
for a in "$@"; do [[ "$prev" == "-v" ]] && src="\${a%%:*}"; prev="$a"; done
mkdir -p "$src/dist"
cp "$src/version.txt" "$src/dist/index.html"`)
  if (!HAS_FLOCK) stub('flock', 'exit 0')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('deploy.sh', () => {
  it('builds a main commit in a container and points current at its release', () => {
    const sha = commit('second')
    const r = deploy(sha)
    expect(r.status, r.out).toBe(0)
    expect(current()).toBe(sha)
    expect(fs.readFileSync(path.join(web, 'current', 'index.html'), 'utf8')).toBe('second\n')
    expect(calls()).toHaveLength(1)
    expect(calls()[0]).toMatch(/^docker run --rm /)
    expect(releases()).toEqual([sha]) // the build folder is gone
  })

  it('takes the commit as an argument when run by hand', () => {
    const sha = commit('second')
    const r = spawnSync('bash', [SCRIPT, sha], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REPO_DIR: repo, WEB_ROOT: web, LOCK_FILE: path.join(root, 'lock') },
    })
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0)
    expect(current()).toBe(sha)
  })

  it.each([
    ['nothing', ''],
    ['a short hash', 'abc123'],
    ['a command', 'rm -rf /'],
    ['a hash with something after it', `${'a'.repeat(40)} x`],
  ])('refuses %s, building nothing', (_, request) => {
    const r = deploy(request)
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/expected one full lowercase commit hash/)
    expect(calls()).toEqual([])
  })

  it('refuses a commit that is not on origin/main', () => {
    git(work, 'checkout', '-q', '-b', 'side')
    const side = commit('side')
    git(work, 'push', '-q', 'origin', 'side')
    const r = deploy(side)
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/not on origin\/main/)
    expect(calls()).toEqual([])
  })

  it('answers success and changes nothing for the commit already deployed or an older one', () => {
    const older = commit('second')
    const newer = commit('third')
    expect(deploy(newer).status).toBe(0)
    for (const sha of [newer, older]) {
      const r = deploy(sha)
      expect(r.status, r.out).toBe(0)
      expect(r.out).toMatch(/nothing to do/)
    }
    expect(current()).toBe(newer)
    expect(calls()).toHaveLength(1)
  })

  it('moves forward after a rollback by hand', () => {
    const older = commit('second')
    const newer = commit('third')
    expect(deploy(older).status).toBe(0)
    expect(deploy(newer).status).toBe(0)
    fs.rmSync(path.join(web, 'current'))
    fs.symlinkSync(`releases/${older}`, path.join(web, 'current'))
    const r = deploy(newer)
    expect(r.status, r.out).toBe(0)
    expect(current()).toBe(newer)
  })

  it('leaves the serving release alone and cleans up when the build fails', () => {
    const first = commit('second')
    expect(deploy(first).status).toBe(0)
    const r = deploy(commit('third'), { DOCKER_FAIL: '1' })
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/build failed/)
    expect(current()).toBe(first)
    expect(releases()).toEqual([first])
  })

  it('runs the pnpm package.json pins, and refuses a commit that pins none', () => {
    fs.writeFileSync(path.join(work, 'package.json'), '{ "packageManager": "pnpm@10.34.8" }\n')
    git(work, 'add', 'package.json')
    const pinned = commit('pinned')
    expect(deploy(pinned).status).toBe(0)
    expect(calls()[0]).toMatch(/PNPM_VERSION=10\.34\.8/)

    fs.writeFileSync(path.join(work, 'package.json'), '{}\n')
    git(work, 'add', 'package.json')
    const r = deploy(commit('unpinned'))
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/packageManager/)
    expect(current()).toBe(pinned)
  })

  it('refuses a build without index.html', () => {
    stub('docker', `echo "docker $*" >> "${callLog}"`)
    const r = deploy(commit('second'))
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/no index\.html/)
    expect(fs.existsSync(path.join(web, 'current'))).toBe(false)
  })

  it('refuses a current link it cannot read as a release', () => {
    fs.mkdirSync(path.join(web, 'releases'))
    fs.symlinkSync('somewhere-else', path.join(web, 'current'))
    const r = deploy(commit('second'))
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/does not point at a release/)
    expect(calls()).toEqual([])
  })

  it('keeps the five newest releases', () => {
    const shas = ['b', 'c', 'd', 'e', 'f', 'g', 'h'].map(label => {
      const sha = commit(label)
      expect(deploy(sha).status).toBe(0)
      return sha
    })
    expect(releases()).toEqual(shas.slice(-5).sort())
    expect(current()).toBe(shas.at(-1))
  }, 30_000)
})
