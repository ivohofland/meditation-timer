export type Strength = 'soft' | 'full'

/** One sounding strike. */
export interface Voice {
  /** Audio-clock time at which the voice has decayed to silence and stops. */
  readonly endsAt: number
  /** Fade the voice out from `at` over a short release, instead of stopping dead. */
  release(at: number): void
}

/** Schedules one strike at audio-clock time `at`. The only seam between the timer and its sound. */
export type Bell = (ctx: BaseAudioContext, at: number, strength: Strength) => Voice
