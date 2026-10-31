/**
 * Renders the stream's audio pieces from DEFAULT_SOUNDS and encodes them as
 * AAC in MPEG-TS, the format HLS players accept everywhere. Run after tuning:
 *   pnpm pieces
 * Needs ffmpeg and ffprobe on the PATH.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Piece, Pieces } from '../src/playlist'
import { renderStrikes } from '../src/render'
import type { Strike } from '../src/strikes'
import { END_GAP_S, END_STRIKES } from '../src/strikes'
import { DEFAULT_SOUNDS, voiceEnd } from '../src/synth-bell'

const SAMPLE_RATE = 48000
const root = resolve(import.meta.dirname, '..')
const outDir = join(root, 'public/stream')
const tmp = mkdtempSync(join(tmpdir(), 'pieces-'))

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 4)
  samples.forEach((s, i) => data.writeFloatLE(s, i * 4))
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

function encode(name: string, strikes: Strike[], nominalS: number, kbps = 96): Piece {
  const src = join(tmp, `${name}.wav`)
  const file = `${name}.ts`
  writeFileSync(src, wav(renderStrikes(DEFAULT_SOUNDS, strikes, nominalS, SAMPLE_RATE)))
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:a', 'aac', '-b:a', `${kbps}k`, '-ar', String(SAMPLE_RATE), '-ac', '1',
    '-muxdelay', '2', '-muxpreload', '0', '-f', 'mpegts', join(outDir, file)])
  // What the player decodes: every AAC frame, 1024 samples each (the container's
  // own duration is unreliable once frames are bundled into larger packets).
  const frames = Number(execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'a:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', join(outDir, file)]).toString().trim().split(/\s+/)[0])
  const durationS = Number(((frames * 1024) / SAMPLE_RATE).toFixed(6))
  return { uri: file, nominalS, durationS }
}

const fullS = Math.ceil(voiceEnd(0, DEFAULT_SOUNDS.full.t60S))
const softS = Math.ceil(voiceEnd(0, DEFAULT_SOUNDS.soft.t60S))
const endStrikes = Array.from({ length: END_STRIKES }, (_, n): Strike => ({ at: n * END_GAP_S, strength: 'full' }))

const pieces: Pieces = {
  // Silence carries nothing; a low bitrate keeps an hour of it to a few megabytes.
  silence: [60, 10, 1].map(s => encode(`silence-${s}`, [], s, 16)),
  soft: encode('soft', [{ at: 0, strength: 'soft' }], softS),
  full: encode('full', [{ at: 0, strength: 'full' }], fullS),
  end: encode('end', endStrikes, (END_STRIKES - 1) * END_GAP_S + fullS),
}
writeFileSync(join(root, 'src/stream-pieces.json'), JSON.stringify(pieces, null, 2) + '\n')
rmSync(tmp, { recursive: true })
console.log(JSON.stringify(pieces, null, 2))
