import { installHint, isStandalone } from './install'

test('suggests the home screen on an iPhone or iPad in the browser', () => {
  expect(installHint({ appleHandheld: true, standalone: false })).toMatch(/Add to Home Screen/)
})

test('says nothing once opened from the home screen, or anywhere else', () => {
  expect(installHint({ appleHandheld: true, standalone: true })).toBeNull()
  // Android shows its own install prompt; a desktop has no lock screen to keep.
  expect(installHint({ appleHandheld: false, standalone: false })).toBeNull()
})

test.each([
  [{ standalone: true }, false, true], // Safari's own flag, from the home screen
  [{}, true, true], // display-mode: standalone elsewhere
  [{ standalone: false }, false, false],
  [{}, false, false],
])('navigator %o with display-mode standalone %s → %s', (nav, displayMode, expected) => {
  expect(isStandalone(nav, displayMode)).toBe(expected)
})
