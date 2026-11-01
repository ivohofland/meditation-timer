/**
 * Opened from the home screen. Safari has its own flag; elsewhere the
 * manifest's display mode tells.
 */
export const isStandalone = (nav: { standalone?: boolean }, displayModeStandalone: boolean): boolean =>
  nav.standalone === true || displayModeStandalone

/**
 * A quiet line suggesting the home screen: only on an iPhone or iPad in the
 * browser, which has no install prompt of its own. Android shows one; a
 * desktop has no lock screen to keep the bells through.
 */
export function installHint(o: { appleHandheld: boolean; standalone: boolean }): string | null {
  if (!o.appleHandheld || o.standalone) return null
  return 'Tip: Share → Add to Home Screen keeps the timer at hand, also offline.'
}
