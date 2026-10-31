import type { Strength } from './bell'
import type { Settings } from './settings'

/** One strike of the bell, `at` seconds after the session starts. */
export interface Strike {
  at: number
  strength: Strength
}

export const END_STRIKES = 3
export const END_GAP_S = 6
/** Time to settle in after Begin before the start bell. */
export const START_DELAY_S = 20

/** Seconds from Begin to the start of the sitting: the start bell, or at once without one. */
export const sittingStartS = (s: Settings): number => (s.startBell ? START_DELAY_S : 0)

/**
 * Every strike of a session, in order, in seconds from Begin. The duration is timed
 * from the start of the sitting; interval strikes fall strictly before its end.
 */
export function planStrikes(s: Settings): Strike[] {
  const start = sittingStartS(s)
  const total = s.totalMinutes * 60
  const strikes: Strike[] = []
  if (s.startBell) strikes.push({ at: start, strength: 'full' })
  if (s.intervalMinutes !== null) {
    const i = s.intervalMinutes * 60
    for (let t = i; t < total; t += i) strikes.push({ at: start + t, strength: 'soft' })
  }
  for (let n = 0; n < END_STRIKES; n++) strikes.push({ at: start + total + n * END_GAP_S, strength: 'full' })
  return strikes
}
