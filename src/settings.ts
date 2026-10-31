export interface Settings {
  totalMinutes: number
  intervalMinutes: number | null
  startBell: boolean
}

export const DEFAULT_SETTINGS: Settings = { totalMinutes: 20, intervalMinutes: null, startBell: true }

const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** Valid settings, or null when any field is missing, the wrong type or out of range. */
export function parseSettings(input: unknown): Settings | null {
  if (typeof input !== 'object' || input === null) return null
  const { totalMinutes, intervalMinutes, startBell } = input as Record<string, unknown>
  if (!intIn(totalMinutes, 1, 180)) return null
  if (intervalMinutes !== null && !intIn(intervalMinutes, 1, 60)) return null
  if (typeof startBell !== 'boolean') return null
  return { totalMinutes, intervalMinutes, startBell }
}
