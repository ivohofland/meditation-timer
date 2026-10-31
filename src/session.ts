import type { Bell, Voice } from './bell'
import type { Settings } from './settings'
import { planStrikes, sittingStartS } from './strikes'

export type SessionState = 'idle' | 'settling' | 'running' | 'ringing-out' | 'done' | 'stopped'

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
  /** Seconds from t0 to the start of the sitting. */
  readonly #leadS: number
  #t0: number | null = null
  #voices: Voice[] = []
  #endsAt = 0
  #stopped = false

  constructor(ctx: BaseAudioContext, bell: Bell, settings: Settings) {
    this.#ctx = ctx
    this.#bell = bell
    this.#settings = settings
    this.#totalS = settings.totalMinutes * 60
    this.#leadS = sittingStartS(settings)
  }

  start(): void {
    if (this.#t0 !== null || this.#stopped) return
    const t0 = this.#ctx.currentTime + LEAD_S
    this.#t0 = t0
    this.#voices = planStrikes(this.#settings).map(s => this.#bell(this.#ctx, t0 + s.at, s.strength))
    this.#endsAt = Math.max(this.#sittingEnd(), ...this.#voices.map(v => v.endsAt))
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
    if (now < this.#t0 + this.#leadS) return 'settling'
    if (now < this.#sittingEnd()) return 'running'
    if (now < this.#endsAt) return 'ringing-out'
    return 'done'
  }

  /** Seconds of the sitting left; the full duration until it starts. */
  remainingS(): number {
    if (this.#t0 === null) return this.#totalS
    return Math.min(this.#totalS, Math.max(0, this.#sittingEnd() - this.#ctx.currentTime))
  }

  /** Seconds until the sitting starts (the start bell); 0 once it has. */
  leadInS(): number {
    if (this.#t0 === null) return this.#leadS
    return Math.max(0, this.#t0 + this.#leadS - this.#ctx.currentTime)
  }

  #sittingEnd(): number {
    return (this.#t0 ?? 0) + this.#leadS + this.#totalS
  }
}
