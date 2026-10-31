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
  partials: readonly Partial[]
}

export const DEFAULT_BOWL: BowlParams = {
  fundamentalHz: 220,
  t60S: 30,
  beatHz: 1.5,
  partials: [
    { ratio: 1, gain: 1, t60Factor: 1 },
    { ratio: 2.71, gain: 0.5, t60Factor: 0.5 },
    { ratio: 5.4, gain: 0.25, t60Factor: 0.3 },
  ],
}

export const SOFT = { gain: 0.5, t60Factor: 0.6 }
export const ATTACK_S = 0.005
export const RELEASE_S = 1.5
/** Level of the beating mode relative to the fundamental. */
export const BEAT_GAIN = 0.5
/** Summed peak of a full strike, leaving headroom below 1. */
const FULL_PEAK = 0.8
const MINUS_90_DB = 10 ** (-90 / 20)

/** When a voice has decayed to −90 dB: 1.5 × its −60 dB time on an exponential decay. */
export const voiceEnd = (at: number, t60S: number): number => at + 1.5 * t60S

/** One sine mode of a strike: its frequency, peak level and −60 dB time. */
export interface Mode {
  hz: number
  peak: number
  t60S: number
}

/** The sine modes of one strike, normalized so a full strike's peaks sum to FULL_PEAK. */
export function bowlModes(params: BowlParams, strength: Strength): Mode[] {
  const level = strength === 'soft' ? SOFT.gain : 1
  const length = strength === 'soft' ? SOFT.t60Factor : 1
  const fundamental = params.partials.find(p => p.ratio === 1) ?? params.partials[0]
  const raw = params.partials.map(p => ({ hz: params.fundamentalHz * p.ratio, gain: p.gain, t60Factor: p.t60Factor }))
  if (fundamental && params.beatHz > 0) {
    raw.push({ hz: params.fundamentalHz + params.beatHz, gain: fundamental.gain * BEAT_GAIN, t60Factor: fundamental.t60Factor })
  }
  const sum = raw.reduce((a, m) => a + m.gain, 0) || 1
  return raw.map(m => ({ hz: m.hz, peak: (m.gain / sum) * FULL_PEAK * level, t60S: params.t60S * m.t60Factor * length }))
}

/** −90 dB as a level: where a voice is let go. */
export { MINUS_90_DB }

export function createSynthBell(params: BowlParams): Bell {
  return (ctx: BaseAudioContext, at: number, strength: Strength): Voice => {
    const out = ctx.createGain()
    out.gain.value = 1
    out.connect(ctx.destination)

    const oscillators: OscillatorNode[] = []
    let endsAt = at
    for (const m of bowlModes(params, strength)) {
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
        out.gain.cancelScheduledValues(t)
        out.gain.setValueAtTime(1, t)
        out.gain.linearRampToValueAtTime(0, t + RELEASE_S)
        const stopAt = Math.min(endsAt, t + RELEASE_S)
        for (const osc of oscillators) osc.stop(stopAt)
      },
    }
  }
}
