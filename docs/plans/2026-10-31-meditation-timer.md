# Meditation Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page that runs a meditation session (duration, optional interval bell, three-bell end) with every strike scheduled on the Web Audio clock, plus a tuning page for the synthesized bell.

**Architecture:** Pure modules decide *what* happens (`planStrikes`, the session state read from a clock); thin modules talk to the browser (`synthBell`, `keepAwake`, `unlockAudio`); two small UI scripts wire them to `index.html` and `tune.html`. No JavaScript timer runs during a session: state and countdown are derived from `AudioContext.currentTime` on each animation frame.

**Tech Stack:** TypeScript (`strict: true`, no `any`), Vite (static multi-page build), Vitest, pnpm, Node 24. No runtime dependencies.

**Spec:** [`docs/design.md`](../design.md)

## Global Constraints

- TypeScript `strict: true`; no `any`; no runtime dependencies.
- No `setTimeout`/`setInterval` anywhere in a session's path. Timing comes from `AudioContext.currentTime`; the UI loop is `requestAnimationFrame`.
- Interval strikes are strictly before the end: `t < total`.
- End: 3 full strikes, `END_GAP_S = 6` seconds apart, the first at `total`.
- A voice stops at `at + 1.5 × t60S` (−90 dB), never earlier, except on release.
- Release (stopping early) fades each sounding voice over `RELEASE_S = 0.3` seconds.
- Settings: `totalMinutes` integer 1–180; `intervalMinutes` integer 1–60 or `null`; `startBell` boolean, default `true`.
- Copy is plain: "Duration", "Bell every", "minutes", "Off", "Start with a bell", "Begin", "Stop". No religious or tradition-specific terms. No history, streaks or stats.
- Settings screen uses fair.yoga's colors: cream `#F7F4EF` page, teal `#1A5653` primary, brown `#6B5B4E` text, Georgia headings, system sans body. Running screen near-black `#111` with countdown in `#6B6B6B`. No transitions.
- Remembering the last settings uses `localStorage`, wrapped in try/catch; the page works without it.

## Review Focus

1. **Interval divides the total** (5 min in 20): exactly one bell sequence at 20:00, the end's. Pinned in Task 1.
2. **Interval ≥ total** (10 min bell in a 10 min session): no interval strikes, no error. Pinned in Task 1.
3. **Begin tapped twice quickly**: one session, one set of strikes. Pinned in Task 3 (`start` on a running session is a no-op).
4. **Stop during the end's ring-out**: every voice still sounding is released, none hard-stopped. Pinned in Task 3.
5. **Page hidden and shown mid-session** (notification shade, app switch): wake lock re-requested; countdown jumps to the true time with no catch-up bells. Pinned in Task 4; the no-catch-up half holds by construction (strikes are pre-scheduled).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/settings.ts` | `Settings` type, `parseSettings`, defaults |
| `src/strikes.ts` | `planStrikes`: settings → ordered strike list |
| `src/bell.ts` | `Strength`, `Voice`, `Bell` types only |
| `src/synth-bell.ts` | `BowlParams`, `DEFAULT_BOWL`, `voiceEnd`, `createSynthBell` |
| `src/session.ts` | `Session`: schedules strikes, derives state/remaining from the clock, cancels |
| `src/platform.ts` | `keepAwake`, `unlockAudio` |
| `src/timer-ui.ts`, `index.html` | The timer page |
| `src/tune-ui.ts`, `tune.html` | The bell tuning page |
| `src/style.css` | Shared tokens and the two screen variants |

---

### Task 1: Scaffold, settings and the strike plan

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `src/bell.ts`, `src/settings.ts`, `src/strikes.ts`
- Test: `src/settings.test.ts`, `src/strikes.test.ts`

**Interfaces:**
- Produces:
  - `type Strength = 'soft' | 'full'` (`bell.ts`)
  - `interface Settings { totalMinutes: number; intervalMinutes: number | null; startBell: boolean }`
  - `const DEFAULT_SETTINGS: Settings = { totalMinutes: 20, intervalMinutes: null, startBell: true }`
  - `parseSettings(input: unknown): Settings | null` (null when any field is out of range or the wrong type)
  - `interface Strike { at: number; strength: Strength }` (`at` in seconds from session start)
  - `const END_STRIKES = 3`, `const END_GAP_S = 6`
  - `planStrikes(s: Settings): Strike[]` (sorted by `at`)

- [ ] **Step 1: Scaffold.** `pnpm init`; dev dependencies `typescript`, `vite`, `vitest`; `packageManager` pinned to the pnpm version fair.yoga uses; `engines.node >= 24`. Scripts `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`). Vite multi-page input: `index.html`, `tune.html`. `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `lib: ["ES2022", "DOM"]`. `.gitignore`: `node_modules`, `dist`.

- [ ] **Step 2: Write the failing tests**

```ts
// strikes.test.ts
const full = (at: number) => ({ at, strength: 'full' })
const soft = (at: number) => ({ at, strength: 'soft' })

test('start bell, no interval', () => {
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: null, startBell: true }))
    .toEqual([full(0), full(600), full(606), full(612)])
})
test('no start bell', () => {
  expect(planStrikes({ totalMinutes: 1, intervalMinutes: null, startBell: false }))
    .toEqual([full(60), full(66), full(72)])
})
test('interval that divides the total does not ring at the end', () => {
  expect(planStrikes({ totalMinutes: 20, intervalMinutes: 5, startBell: false }))
    .toEqual([soft(300), soft(600), soft(900), full(1200), full(1206), full(1212)])
})
test('interval that does not divide the total', () => {
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: 3, startBell: false }).filter(s => s.strength === 'soft'))
    .toEqual([soft(180), soft(360), soft(540)])
})
test('interval >= total gives no interval strikes', () => {
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: 10, startBell: false }).filter(s => s.strength === 'soft')).toEqual([])
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: 15, startBell: false }).filter(s => s.strength === 'soft')).toEqual([])
})
```

```ts
// settings.test.ts
test('accepts valid settings', () => {
  expect(parseSettings({ totalMinutes: 20, intervalMinutes: 5, startBell: false }))
    .toEqual({ totalMinutes: 20, intervalMinutes: 5, startBell: false })
  expect(parseSettings({ totalMinutes: 180, intervalMinutes: null, startBell: true })).not.toBeNull()
})
test.each([
  { totalMinutes: 0, intervalMinutes: null, startBell: true },
  { totalMinutes: 181, intervalMinutes: null, startBell: true },
  { totalMinutes: 2.5, intervalMinutes: null, startBell: true },
  { totalMinutes: 20, intervalMinutes: 0, startBell: true },
  { totalMinutes: 20, intervalMinutes: 61, startBell: true },
  { totalMinutes: 20, intervalMinutes: null, startBell: 'yes' },
  null, 'x', {},
])('rejects %j', input => expect(parseSettings(input)).toBeNull())
```

- [ ] **Step 3: Run** `pnpm test`. Expected: FAIL, modules not found.
- [ ] **Step 4: Implement** `bell.ts` (`Strength` only for now), `settings.ts`, `strikes.ts`. Interval loop is `for (t = i; t < total; t += i)`.
- [ ] **Step 5: Run** `pnpm test`. Expected: PASS. `pnpm exec tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat: settings and strike plan`

---

### Task 2: The synthesized bell

**Files:**
- Modify: `src/bell.ts`
- Create: `src/synth-bell.ts`
- Test: `src/synth-bell.test.ts`

**Interfaces:**
- Consumes: `Strength`
- Produces:
  - `interface Voice { readonly endsAt: number; release(at: number): void }`
  - `type Bell = (ctx: BaseAudioContext, at: number, strength: Strength) => Voice`
  - `interface Partial { ratio: number; gain: number; t60Factor: number }`
  - `interface BowlParams { fundamentalHz: number; t60S: number; beatHz: number; partials: readonly Partial[] }`
  - `const DEFAULT_BOWL: BowlParams` = `{ fundamentalHz: 220, t60S: 30, beatHz: 1.5, partials: [{ ratio: 1, gain: 1, t60Factor: 1 }, { ratio: 2.71, gain: 0.5, t60Factor: 0.5 }, { ratio: 5.4, gain: 0.25, t60Factor: 0.3 }] }`
  - `const SOFT = { gain: 0.5, t60Factor: 0.6 }`, `const ATTACK_S = 0.005`, `const RELEASE_S = 0.3`
  - `voiceEnd(at: number, t60S: number): number` → `at + 1.5 * t60S`
  - `createSynthBell(params: BowlParams): Bell`

Each strike: one oscillator per partial, plus a second oscillator on the fundamental at `fundamentalHz + beatHz` (the beat). Each partial's gain: `0 → peak` linearly over `ATTACK_S`, then `exponentialRampToValueAtTime(peak × 10^(−90/20), voiceEnd(at, t60))` where `t60 = t60S × t60Factor` (× `SOFT.t60Factor` and peak × `SOFT.gain` for a soft strike). All partials feed one per-voice output gain; `release(at)` ramps that output gain to 0 over `RELEASE_S` and stops the oscillators at `at + RELEASE_S`. Oscillators otherwise stop at the fundamental's `voiceEnd`. Normalize so a full strike's summed peak stays below 1.

- [ ] **Step 1: Write the failing tests** against a hand-written fake context (in the test file) that records `createOscillator` frequencies, `start`/`stop` times and AudioParam calls:

```ts
test('voiceEnd is -90 dB on an exponential decay', () => {
  expect(voiceEnd(10, 30)).toBe(55)
})
test('a full strike sounds every partial plus the beat', () => {
  const ctx = fakeContext()
  createSynthBell(DEFAULT_BOWL)(ctx, 5, 'full')
  expect(ctx.oscillators.map(o => o.frequency).sort((a, b) => a - b))
    .toEqual([220, 221.5, 596.2, 1188])
  expect(ctx.oscillators.every(o => o.startedAt === 5)).toBe(true)
})
test('voice ends at the fundamental voiceEnd and oscillators stop there', () => {
  const ctx = fakeContext()
  const v = createSynthBell(DEFAULT_BOWL)(ctx, 5, 'full')
  expect(v.endsAt).toBe(voiceEnd(5, 30))
  expect(ctx.oscillators.every(o => o.stoppedAt === v.endsAt)).toBe(true)
})
test('a soft strike is quieter and shorter', () => {
  const ctx = fakeContext()
  const v = createSynthBell(DEFAULT_BOWL)(ctx, 0, 'soft')
  expect(v.endsAt).toBe(voiceEnd(0, 30 * 0.6))
})
test('release fades over RELEASE_S and stops the oscillators after it', () => {
  const ctx = fakeContext()
  const v = createSynthBell(DEFAULT_BOWL)(ctx, 0, 'full')
  v.release(10)
  expect(ctx.oscillators.every(o => o.stoppedAt === 10 + RELEASE_S)).toBe(true)
  // the output gain received a ramp to 0 ending at 10 + RELEASE_S
})
```

Compare floats with `toBeCloseTo` where products are involved.

- [ ] **Step 2: Run** `pnpm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `bell.ts` types and `synth-bell.ts`.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: synthesized bowl bell`

---

### Task 3: The session

**Files:**
- Create: `src/session.ts`
- Test: `src/session.test.ts`

**Interfaces:**
- Consumes: `Settings`, `planStrikes`, `Bell`, `Voice`
- Produces:
  - `type SessionState = 'idle' | 'running' | 'ringing-out' | 'done' | 'stopped'`
  - `const LEAD_S = 0.1` (scheduling headroom after the tap)
  - `class Session { constructor(ctx: BaseAudioContext, bell: Bell, settings: Settings); start(): void; stop(): void; state(): SessionState; remainingS(): number }`

Behaviour: `start()` records `t0 = ctx.currentTime + LEAD_S` and calls `bell(ctx, t0 + strike.at, strike.strength)` for every planned strike, keeping the voices; a second `start()` does nothing. `state()` is derived from `ctx.currentTime` on every call: `running` before `t0 + total`, `ringing-out` until the latest `voice.endsAt`, then `done`. `remainingS()` is `max(0, t0 + total − currentTime)`, and `total` before start. `stop()` releases every voice whose `endsAt` is after `currentTime`, at `currentTime`, and sets `stopped`; on a `done` or `stopped` session it does nothing.

- [ ] **Step 1: Write the failing tests** with a fake context `{ currentTime: number }` (cast through a narrow `Clock` interface `{ readonly currentTime: number }`, which is what `Session` actually needs besides passing `ctx` to the bell) and a fake bell recording `(at, strength)` and returning voices with spies on `release`:

```ts
test('start schedules every planned strike once, offset by t0', () => {
  const { ctx, bell, calls } = fakes({ currentTime: 2 })
  const s = new Session(ctx, bell, { totalMinutes: 1, intervalMinutes: null, startBell: true })
  s.start()
  expect(calls).toEqual([[2.1, 'full'], [62.1, 'full'], [68.1, 'full'], [74.1, 'full']])
})
test('a second start does nothing', () => {
  const { ctx, bell, calls } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  s.start(); s.start()
  expect(calls).toHaveLength(4)
})
test('state and remaining follow the clock', () => {
  const { ctx, bell } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)   // fake voices end 40 s after their strike
  expect(s.state()).toBe('idle'); expect(s.remainingS()).toBe(60)
  s.start()
  ctx.currentTime = 30.1; expect(s.state()).toBe('running'); expect(s.remainingS()).toBeCloseTo(30)
  ctx.currentTime = 61;   expect(s.state()).toBe('ringing-out'); expect(s.remainingS()).toBe(0)
  ctx.currentTime = 200;  expect(s.state()).toBe('done')
})
test('stop during ring-out releases only voices still sounding', () => {
  const { ctx, bell, voices } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  s.start()
  ctx.currentTime = 70
  s.stop()
  // start strike (ends 40.1) is silent already; the end strikes are sounding or still to come
  expect(voices.map(v => v.release.mock.calls)).toEqual([[], [[70]], [[70]], [[70]]])
  expect(s.state()).toBe('stopped')
})
test('stop after done does nothing', () => { /* currentTime past last endsAt; no release calls; state stays done */ })
```

- [ ] **Step 2: Run** `pnpm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `session.ts`. No timers.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: session scheduled on the audio clock`

---

### Task 4: Platform helpers

**Files:**
- Create: `src/platform.ts`
- Test: `src/platform.test.ts`

**Interfaces:**
- Produces:
  - `keepAwake(nav: Navigator, doc: Document): { release(): void }`
  - `unlockAudio(ctx: AudioContext, doc: Document): Promise<void>`

`keepAwake` requests `nav.wakeLock.request('screen')` if `wakeLock` exists, re-requests on `visibilitychange` when `doc.visibilityState === 'visible'`, swallows every rejection (the timer works without it), and `release()` releases the current lock and removes the listener. `unlockAudio` must be called inside the user's tap: it `resume()`s the context and starts a looping, muted-content `<audio>` element (a generated 1-second silent WAV as a `data:` URI, `playsInline`) so the iPhone silent switch does not mute Web Audio; a rejected `play()` is ignored.

- [ ] **Step 1: Write the failing tests** with fake `nav`/`doc` objects:
  - `requests a screen lock` — `request` called once with `'screen'`.
  - `re-requests when the page becomes visible again` — fire `visibilitychange` with `visibilityState = 'visible'`; `request` called twice. With `'hidden'`: not called again.
  - `release stops re-requesting` — after `release()`, a visible `visibilitychange` does not call `request`; the held sentinel's `release` was called.
  - `no wakeLock support is not an error` — `nav` without `wakeLock`; `keepAwake` returns, `release()` is safe.
  - `a refused request is swallowed` — `request` rejects; no unhandled rejection (`await` a tick, assert nothing thrown).
- [ ] **Step 2: Run** `pnpm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `platform.ts`. `unlockAudio` is covered by the manual check in Task 6, not a unit test.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: wake lock and audio unlock`

---

### Task 5: Tuning page (the synthesis gate)

**Files:**
- Create: `tune.html`, `src/tune-ui.ts`, `src/style.css`

**Interfaces:**
- Consumes: `DEFAULT_BOWL`, `BowlParams`, `createSynthBell`, `END_GAP_S`, `unlockAudio`

A plain page: sliders for `fundamentalHz` (150–500), `t60S` (5–60), `beatHz` (0–4), and each partial's `ratio` and `gain`; buttons **Soft**, **Full**, **End (three bells)**; a read-only `<pre>` showing the current params as a `BowlParams` literal to paste into `DEFAULT_BOWL`. Each button builds a fresh bell from the current slider values. "End" strikes three times `END_GAP_S` apart. The first tap calls `unlockAudio`.

- [ ] **Step 1: Build the page.** `pnpm dev`, open `/tune.html`.
- [ ] **Step 2: Verify by ear on a desktop:** strikes overlap without cutting each other off; a strike's tail fades to nothing with no audible end; no click on any strike.
- [ ] **Step 3: Verify on a phone** (iPhone with silent switch on, and Android) over the LAN (`pnpm dev --host`): sound plays; same three checks.
- [ ] **Step 4: Tune** to taste and paste the result into `DEFAULT_BOWL`; update the Task 2 test's expected frequencies to match.
- [ ] **Step 5: Decision gate.** If the bell still sounds fake after tuning, stop here and open an issue for the recorded fallback (`createSampleBell(buffer: AudioBuffer): Bell`, recording from a borrowed good bowl, CC0, credited). The rest of the plan is unchanged by that switch.
- [ ] **Step 6: Commit** `feat: bell tuning page` (and `chore: tune default bowl` separately if `DEFAULT_BOWL` changed).

---

### Task 6: The timer page

**Files:**
- Create: `index.html`, `src/timer-ui.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `Settings`, `DEFAULT_SETTINGS`, `parseSettings`, `Session`, `createSynthBell`, `DEFAULT_BOWL`, `keepAwake`, `unlockAudio`

**Settings screen** (cream): heading "Meditation timer"; **Duration** (number, minutes, 1–180); **Bell every** (select: Off, 1, 2, 3, 5, 10, 15, 20, 30 minutes); **Start with a bell** (checkbox); **Begin** button. Initial values: `parseSettings` of the `localStorage` entry `meditation-timer:settings`, else `DEFAULT_SETTINGS`. Begin saves the settings back (try/catch).

**Running screen** (near-black): countdown `mm:ss` (`h:mm:ss` from 60 minutes up), from `Math.ceil(session.remainingS())`; one **Stop** button. During ring-out the countdown shows `0:00`.

**Flow:** Begin → create `AudioContext` → `await unlockAudio` → `keepAwake` → `new Session(...).start()` → `requestAnimationFrame` loop reading `state()` and `remainingS()`. On `done` or `stopped`: cancel the loop, release the wake lock, `ctx.close()` (on `stopped`, after `RELEASE_S`, via `ctx.currentTime` checked in the frame loop, still no `setTimeout`), return to the settings screen. Begin is disabled while a session exists.

- [ ] **Step 1: Build the page.** `pnpm build` passes (`tsc` clean).
- [ ] **Step 2: Verify on a phone** with a 2-minute session, bell every 1 minute, start bell on: start strike, one soft strike at 1:00, three full strikes at 2:00 spaced 6 s, screen stays on throughout, return to settings only after the last tail.
- [ ] **Step 3: Verify the Review Focus cases by hand:** a 2-minute session with a 1-minute bell rings once at 1:00 and only the end at 2:00; Begin double-tapped starts one session; Stop during the end's ring-out fades with no click; pull down the notification shade mid-session and return: countdown correct, no extra bells; settings remembered after reload.
- [ ] **Step 4: Commit** `feat: timer page`

---

### Task 7: Publish at timer.fair.yoga

Hosted on fair.yoga's VPS as static files served by Nginx: no Node process,
no container. The box is shared; nothing that operates it is. The timer has
its own Nginx site file, its own certificate, its own web root and its own
deploy path, so a mistake on the timer's side cannot reach fair.yoga's
deploy, config or certificate renewal.

**Files:**
- Create: `deploy/nginx.conf.example`, `deploy/DEPLOYMENT.md`
- Modify: `README.md`

**Fixed values:**
- Hostname `timer.fair.yoga`; web root `/var/www/timer.fair.yoga`, owned by `deploy`.
- Nginx site file `/etc/nginx/sites-available/timer.fair.yoga`, symlinked into `sites-enabled`. fair.yoga's site file is not edited.
- A separate Let's Encrypt certificate (`certbot certonly --webroot -w /var/www/timer.fair.yoga -d timer.fair.yoga`), not an expansion of the fair.yoga one, so a broken timer DNS record cannot fail fair.yoga's renewal.
- Deploy: `pnpm build` locally, then `rsync -a --delete dist/ deploy@<vps>:/var/www/timer.fair.yoga/`. Manual until it has been proven; a CI job with its own forced-command key restricted to that directory comes later, if ever. Never through `fairyoga-deploy`.
- No cookies at all, and none with `Domain=.fair.yoga`.

- [ ] **Step 1: Write `deploy/nginx.conf.example`**, following fair.yoga's own example's two-phase shape (the port-80 block alone first, so certbot can issue before a `listen ... ssl` block exists):
  - port 80: `location /.well-known/acme-challenge/ { root /var/www/timer.fair.yoga; }`, everything else `301` to HTTPS.
  - port 443 (`http2 on`, IPv4 and IPv6 listeners), `root /var/www/timer.fair.yoga;`, `try_files $uri $uri.html =404;` so `/tune` serves `tune.html`.
  - Headers, `always`:
    - `Strict-Transport-Security "max-age=63072000; includeSubDomains"`
    - `X-Content-Type-Options "nosniff"`
    - `X-Frame-Options "DENY"`
    - `Referrer-Policy "no-referrer"`
    - `Permissions-Policy "screen-wake-lock=(self), camera=(), microphone=(), geolocation=()"`
    - `Content-Security-Policy "default-src 'self'; media-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"` (`media-src data:` is the silent WAV from Task 4)
  - Caching: `location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; }` (Vite's hashed files; repeat the security headers there, since an `add_header` in a `location` replaces the server-level ones). HTML: `Cache-Control "no-cache"`.

- [ ] **Step 2: Write `deploy/DEPLOYMENT.md`** with the one-time setup, in order: DNS `A`/`AAAA` records for `timer` to the VPS's IPv4/IPv6; create the web root; install the port-80 block, `nginx -t`, reload; issue the certificate; install the 443 block, `nginx -t`, reload; confirm the existing certbot renewal hook in `/etc/letsencrypt/renewal-hooks/deploy/` reloads Nginx for every certificate, not only fair.yoga's (`certbot renew --dry-run` lists both). Then the deploy command, and a rollback (redeploy the previous commit's build).

- [ ] **Step 3: Set it up on the VPS** following `DEPLOYMENT.md`. The owner runs the server steps or approves each one; nothing here touches fair.yoga's site file, container or deploy key.

- [ ] **Step 4: Verify.**
  - `curl -sI https://timer.fair.yoga` shows `200` and every header above; `curl -sI http://timer.fair.yoga` shows `301`.
  - `curl -sI https://fair.yoga/api/health` and the fair.yoga homepage still answer as before.
  - On a phone: the Task 6 manual check passes against the live URL (wake lock works, so the `Permissions-Policy` allows it; the silent-switch unlock works, so the CSP allows the `data:` audio).
  - `sudo certbot renew --dry-run` succeeds for both certificates.

- [ ] **Step 5: Update the README:** how to run (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build` → static `dist/`), the tuning page, the live URL, and a pointer to `deploy/DEPLOYMENT.md`.

- [ ] **Step 6: Commit** `docs: hosting at timer.fair.yoga`.

A link from fair.yoga's footer to `timer.fair.yoga` is a change to the fair.yoga repo and goes through that repo's own process.
