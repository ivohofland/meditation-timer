import type { Bell, Strength, Voice } from './bell'

export interface Partial {
  /** Frequency as a multiple of the fundamental. */
  ratio: number
  /** Relative level before normalization. */
  gain: number
  /** This partial's −60 dB time as a fraction of the bowl's. */
  t60Factor: number
}

export interface BowlParams {
  fundamentalHz: number
  /** Time for the fundamental to fall 60 dB, in seconds. */
  t60S: number
  /** Beat between the fundamental and a near-identical second mode. */
  beatHz: number
  /** Overall level: 1 is a full bowl strike. */
  level: number
  partials: readonly Partial[]
}

/** The two sounds: the bowl for start and end, the ting for the interval. */
export interface Sounds {
  full: BowlParams
  soft: BowlParams
}

export const DEFAULT_BOWL: BowlParams = {
  fundamentalHz: 220,
  t60S: 30,
  beatHz: 1.5,
  level: 1,
  partials: [
    { ratio: 1, gain: 1, t60Factor: 1 },
    { ratio: 2.71, gain: 0.5, t60Factor: 0.5 },
    { ratio: 5.4, gain: 0.25, t60Factor: 0.3 },
  ],
}

/**
 * A short, high, quiet ting: marks the interval without pulling you out.
 * Halfway between a small bell and a tingsha; the last partial is the strike.
 */
export const DEFAULT_TING: BowlParams = {
  fundamentalHz: 1444,
  t60S: 4,
  beatHz: 2.5,
  level: 0.4,
  partials: [
    { ratio: 1, gain: 1, t60Factor: 1 },
    { ratio: 2.47, gain: 0.6, t60Factor: 0.6 },
    { ratio: 4.59, gain: 0.35, t60Factor: 0.33 },
    { ratio: 7.02, gain: 0.25, t60Factor: 0.07 },
  ],
}

export const DEFAULT_SOUNDS: Sounds = { full: DEFAULT_BOWL, soft: DEFAULT_TING }

export const ATTACK_S = 0.005
export const RELEASE_S = 1.5
/** Level of the beating mode relative to the fundamental. */
export const BEAT_GAIN = 0.5
/** Summed peak of a full strike, leaving headroom below 1. */
export const FULL_PEAK = 0.8
const MINUS_90_DB = 10 ** (-90 / 20)

/** When a voice has decayed to −90 dB: 1.5 × its −60 dB time on an exponential decay. */
export const voiceEnd = (at: number, t60S: number): number => at + 1.5 * t60S

/** One sine mode of a strike: its frequency, peak level and −60 dB time. */
export interface Mode {
  hz: number
  peak: number
  t60S: number
}

/** The sine modes of one strike, normalized so their peaks sum to FULL_PEAK × level. */
export function bowlModes(params: BowlParams): Mode[] {
  const fundamental = params.partials.find(p => p.ratio === 1) ?? params.partials[0]
  const raw = params.partials.map(p => ({ hz: params.fundamentalHz * p.ratio, gain: p.gain, t60Factor: p.t60Factor }))
  if (fundamental && params.beatHz > 0) {
    raw.push({ hz: params.fundamentalHz + params.beatHz, gain: fundamental.gain * BEAT_GAIN, t60Factor: fundamental.t60Factor })
  }
  const sum = raw.reduce((a, m) => a + m.gain, 0) || 1
  return raw.map(m => ({ hz: m.hz, peak: (m.gain / sum) * FULL_PEAK * params.level, t60S: params.t60S * m.t60Factor }))
}

/** −90 dB as a level: where a voice is let go. */
export { MINUS_90_DB }

export function createSynthBell(sounds: Sounds): Bell {
  return (ctx: BaseAudioContext, at: number, strength: Strength): Voice => {
    const out = ctx.createGain()
    out.gain.value = 1
    out.connect(ctx.destination)

    const oscillators: OscillatorNode[] = []
    let endsAt = at
    for (const m of bowlModes(sounds[strength])) {
      const end = voiceEnd(at, m.t60S)
      endsAt = Math.max(endsAt, end)

      const env = ctx.createGain()
      env.gain.setValueAtTime(0, at)
      env.gain.linearRampToValueAtTime(m.peak, at + ATTACK_S)
      env.gain.exponentialRampToValueAtTime(m.peak * MINUS_90_DB, end)
      env.connect(out)

      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = m.hz
      osc.connect(env)
      osc.start(at)
      oscillators.push(osc)
    }
    for (const osc of oscillators) osc.stop(endsAt)

    return {
      endsAt,
      release(t: number) {
        if (t <= at) {
          // Not struck yet: it must not sound at all.
          for (const osc of oscillators) osc.stop(t)
          return
        }
        out.gain.cancelScheduledValues(t)
        out.gain.setValueAtTime(1, t)
        out.gain.linearRampToValueAtTime(0, t + RELEASE_S)
        const stopAt = Math.min(endsAt, t + RELEASE_S)
        for (const osc of oscillators) osc.stop(stopAt)
      },
    }
  }
}
