import type { Bell, Voice } from './bell'
import type { Settings } from './settings'
import { planStrikes } from './strikes'

export type SessionState = 'idle' | 'running' | 'ringing-out' | 'done' | 'stopped'

/** Scheduling headroom after the tap, so the first strike is never in the past. */
export const LEAD_S = 0.1

/**
 * One sitting. `start()` schedules every strike on the audio clock at once;
 * after that, state and countdown are read from `ctx.currentTime`. No timers.
 */
export class Session {
  readonly #ctx: BaseAudioContext
  readonly #bell: Bell
  readonly #settings: Settings
  readonly #totalS: number
  #t0: number | null = null
  #voices: Voice[] = []
  #endsAt = 0
  #stopped = false

  constructor(ctx: BaseAudioContext, bell: Bell, settings: Settings) {
    this.#ctx = ctx
    this.#bell = bell
    this.#settings = settings
    this.#totalS = settings.totalMinutes * 60
  }

  start(): void {
    if (this.#t0 !== null || this.#stopped) return
    const t0 = this.#ctx.currentTime + LEAD_S
    this.#t0 = t0
    this.#voices = planStrikes(this.#settings).map(s => this.#bell(this.#ctx, t0 + s.at, s.strength))
    this.#endsAt = Math.max(t0 + this.#totalS, ...this.#voices.map(v => v.endsAt))
  }

  stop(): void {
    const state = this.state()
    if (state === 'done' || state === 'stopped') return
    this.#stopped = true
    const now = this.#ctx.currentTime
    for (const v of this.#voices) if (v.endsAt > now) v.release(now)
  }

  state(): SessionState {
    if (this.#stopped) return 'stopped'
    if (this.#t0 === null) return 'idle'
    const now = this.#ctx.currentTime
    if (now < this.#t0 + this.#totalS) return 'running'
    if (now < this.#endsAt) return 'ringing-out'
    return 'done'
  }

  remainingS(): number {
    if (this.#t0 === null) return this.#totalS
    return Math.max(0, this.#t0 + this.#totalS - this.#ctx.currentTime)
  }
}
