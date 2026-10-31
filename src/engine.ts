export type EngineName = 'stream' | 'webaudio'

/**
 * The stream is used where it is needed and known to work: iPhone and iPad,
 * which stop page audio when locked and accept the stream's data: playlist.
 * Elsewhere the live Web Audio bell is better: exact timing, a real fade on
 * Stop, no network during the sitting. (Chrome rejects a data: playlist;
 * Android is untested.)
 */
export function chooseEngine(o: { appleHandheld: boolean; override: string | null }): EngineName {
  if (o.override === 'stream' || o.override === 'webaudio') return o.override
  return o.appleHandheld ? 'stream' : 'webaudio'
}

/** iPhone or iPad. iPadOS presents as a Mac; a touchscreen gives it away. */
export const isAppleHandheld = (userAgent: string, maxTouchPoints: number): boolean =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
