import { formatRemaining } from './format'
import { keepAudioRunning, keepAwake, unlockAudio } from './platform'
import { type SessionState, Session } from './session'
import { beginStream } from './stream-engine'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './settings'
import { START_DELAY_S } from './strikes'
import { createSynthBell, DEFAULT_SOUNDS, RELEASE_S } from './synth-bell'

const STORAGE_KEY = 'meditation-timer:settings'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const form = $<HTMLFormElement>('settings')
const duration = $<HTMLInputElement>('duration')
const interval = $<HTMLSelectElement>('interval')
const startBell = $<HTMLInputElement>('start-bell')
const begin = $<HTMLButtonElement>('begin')
const settingsScreen = $<HTMLElement>('settings-screen')
const runningScreen = $<HTMLElement>('running-screen')
const countdown = $<HTMLElement>('countdown')
const leadIn = $<HTMLElement>('lead-in')
const leadInTime = $<HTMLElement>('lead-in-time')
const stop = $<HTMLButtonElement>('stop')
const notice = $<HTMLElement>('notice')
const pausedNotice = $<HTMLElement>('paused-notice')
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return (raw && parseSettings(JSON.parse(raw))) || DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: Settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* works without it */ }
}

function readForm(): Settings | null {
  return parseSettings({
    totalMinutes: Number(duration.value),
    intervalMinutes: interval.value === '' ? null : Number(interval.value),
    startBell: startBell.checked,
  })
}

function fillForm(s: Settings) {
  duration.value = String(s.totalMinutes)
  interval.value = s.intervalMinutes === null ? '' : String(s.intervalMinutes)
  if (interval.selectedIndex === -1) interval.value = '' // a stored interval the menu does not offer
  startBell.checked = s.startBell
}

function showRunning(running: boolean) {
  settingsScreen.hidden = running
  runningScreen.hidden = !running
  document.body.classList.toggle('running', running)
  themeColor?.setAttribute('content', running ? '#111111' : '#F7F4EF')
}

/** A sitting in progress, whichever engine plays it. */
interface Running {
  state(): SessionState
  remainingS(): number
  leadInS(): number
  stop(): void
  /** Advance anything that runs per frame (the stream's fade). */
  tick(): void
  /** True once a stopped sitting has faded out. */
  released(): boolean
  error(): string | null
  /** A problem to show while the sitting runs, if any. */
  warning(): string | null
  /** Free the engine's resources once the sitting is over. */
  finish(): void
}

/** Web Audio: every strike scheduled on the audio clock at Begin. Keeps the screen on. */
async function beginWebAudio(settings: Settings): Promise<Running> {
  // Created and resumed inside the tap, as iOS requires.
  const ctx = new AudioContext()
  const silence = await unlockAudio(ctx, document)
  const watch = keepAudioRunning(ctx, document)
  const session = new Session(ctx, createSynthBell(DEFAULT_SOUNDS), settings)
  const lock = keepAwake(navigator, document)
  session.start()
  let stoppedAt: number | null = null
  return {
    state: () => session.state(),
    remainingS: () => session.remainingS(),
    leadInS: () => session.leadInS(),
    stop() {
      if (stoppedAt !== null) return
      session.stop()
      stoppedAt = ctx.currentTime
    },
    tick() {},
    released: () => stoppedAt !== null && ctx.currentTime >= stoppedAt + RELEASE_S,
    error: () => null,
    warning: () => (ctx.state === 'running' ? null : 'The phone paused the sound. Later bells may be late or missing.'),
    finish() {
      lock.release()
      watch.release()
      silence.release()
      ctx.close().catch(() => {})
    },
  }
}

let active: { running: Running; frame: number } | null = null

function frame() {
  if (!active) return
  const { running } = active
  running.tick()
  const state = running.state()
  countdown.textContent = formatRemaining(running.remainingS())
  leadIn.hidden = state !== 'settling'
  const warning = running.warning()
  pausedNotice.hidden = warning === null
  pausedNotice.textContent = warning ?? ''
  const lead = running.leadInS()
  if (lead > 0) leadInTime.textContent = formatRemaining(lead)
  if (state === 'done' || (state === 'stopped' && running.released())) {
    finish()
    return
  }
  active.frame = requestAnimationFrame(frame)
}

function finish() {
  if (!active) return
  cancelAnimationFrame(active.frame)
  const { running } = active
  active = null
  running.finish()
  const error = running.error()
  notice.hidden = error === null
  notice.textContent = error ? `The sound stopped: ${error}` : ''
  showRunning(false)
  begin.disabled = false
  begin.focus()
}

let starting = false

form.addEventListener('submit', async event => {
  event.preventDefault()
  // Begin again while the last sitting is still fading: let it go now.
  if (active?.running.state() === 'stopped') finish()
  if (active || starting) return
  const settings = readForm()
  if (!settings) { form.reportValidity(); return }
  starting = true
  begin.disabled = true
  notice.hidden = true
  saveSettings(settings)

  // Called without an await before it: both engines must start inside the tap.
  const running = await (document.body.dataset.engine === 'stream' ? beginStream(settings) : beginWebAudio(settings))
  active = { running, frame: 0 }
  starting = false
  showRunning(true)
  stop.focus()
  active.frame = requestAnimationFrame(frame)
})

// Back to the settings at once; the sound fades out underneath and the frame
// loop frees the engine once it has.
stop.addEventListener('click', () => {
  if (!active) return
  active.running.stop()
  showRunning(false)
  begin.disabled = false
  begin.focus()
})

fillForm(loadSettings())
$<HTMLElement>('start-bell-note').textContent = `after ${START_DELAY_S} seconds to settle in`
