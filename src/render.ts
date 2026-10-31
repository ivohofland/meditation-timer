import type { Strike } from './strikes'
import { ATTACK_S, type BowlParams, bowlModes, MINUS_90_DB, voiceEnd } from './synth-bell'

/**
 * Renders strikes to mono samples with the same envelope the Web Audio bell
 * schedules: a linear attack, then an exponential decay to −90 dB at voiceEnd.
 * Used to record the stream's bell pieces from the synthesized bowl.
 */
export function renderStrikes(params: BowlParams, strikes: readonly Strike[], lengthS: number, sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(lengthS * sampleRate))
  const decay = Math.log(MINUS_90_DB)
  for (const strike of strikes) {
    for (const m of bowlModes(params, strike.strength)) {
      const dur = voiceEnd(0, m.t60S)
      const first = Math.ceil(strike.at * sampleRate)
      const last = Math.min(out.length, Math.floor((strike.at + dur) * sampleRate))
      const w = 2 * Math.PI * m.hz
      for (let i = first; i < last; i++) {
        const t = i / sampleRate - strike.at
        const env = t < ATTACK_S
          ? (m.peak * t) / ATTACK_S
          : m.peak * Math.exp((decay * (t - ATTACK_S)) / (dur - ATTACK_S))
        out[i]! += env * Math.sin(w * t)
      }
    }
  }
  return out
}
