import { formatRemaining } from './format'
import { keepAwake, unlockAudio } from './platform'
import { Session } from './session'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './settings'
import { START_DELAY_S } from './strikes'
import { createSynthBell, DEFAULT_BOWL, RELEASE_S } from './synth-bell'

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

let active: {
  ctx: AudioContext
  session: Session
  lock: { release(): void }
  frame: number
  stoppedAt: number | null
} | null = null

function frame() {
  if (!active) return
  const { ctx, session } = active
  const state = session.state()
  countdown.textContent = formatRemaining(session.remainingS())
  const lead = session.leadInS()
  leadIn.hidden = !(state === 'settling')
  if (lead > 0) leadInTime.textContent = formatRemaining(lead)
  const finished = state === 'done' || (state === 'stopped' && active.stoppedAt !== null && ctx.currentTime >= active.stoppedAt + RELEASE_S)
  if (finished) {
    finish()
    return
  }
  active.frame = requestAnimationFrame(frame)
}

function finish() {
  if (!active) return
  cancelAnimationFrame(active.frame)
  active.lock.release()
  active.ctx.close().catch(() => {})
  active = null
  showRunning(false)
  begin.disabled = false
  begin.focus()
}

let starting = false

form.addEventListener('submit', async event => {
  event.preventDefault()
  if (active || starting) return
  const settings = readForm()
  if (!settings) { form.reportValidity(); return }
  starting = true
  begin.disabled = true
  saveSettings(settings)

  // Created and resumed inside the tap, as iOS requires.
  const ctx = new AudioContext()
  await unlockAudio(ctx, document)

  const session = new Session(ctx, createSynthBell(DEFAULT_BOWL), settings)
  active = { ctx, session, lock: keepAwake(navigator, document), frame: 0, stoppedAt: null }
  session.start()
  starting = false
  showRunning(true)
  stop.focus()
  active.frame = requestAnimationFrame(frame)
})

stop.addEventListener('click', () => {
  if (!active || active.stoppedAt !== null) return
  active.session.stop()
  active.stoppedAt = active.ctx.currentTime
})

fillForm(loadSettings())
$<HTMLElement>('start-bell-note').textContent = `after ${START_DELAY_S} seconds to settle in`
