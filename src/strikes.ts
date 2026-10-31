import type { Strength } from './bell'
import type { Settings } from './settings'

/** One strike of the bell, `at` seconds after the session starts. */
export interface Strike {
  at: number
  strength: Strength
}

export const END_STRIKES = 3
export const END_GAP_S = 6

/** Every strike of a session, in order. Interval strikes fall strictly before the end. */
export function planStrikes(s: Settings): Strike[] {
  const total = s.totalMinutes * 60
  const strikes: Strike[] = []
  if (s.startBell) strikes.push({ at: 0, strength: 'full' })
  if (s.intervalMinutes !== null) {
    const i = s.intervalMinutes * 60
    for (let t = i; t < total; t += i) strikes.push({ at: t, strength: 'soft' })
  }
  for (let n = 0; n < END_STRIKES; n++) strikes.push({ at: total + n * END_GAP_S, strength: 'full' })
  return strikes
}
