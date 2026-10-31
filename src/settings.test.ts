import { parseSettings } from './settings'

test('accepts valid settings', () => {
  expect(parseSettings({ totalMinutes: 20, intervalMinutes: 5, startBell: false }))
    .toEqual({ totalMinutes: 20, intervalMinutes: 5, startBell: false })
  expect(parseSettings({ totalMinutes: 180, intervalMinutes: null, startBell: true })).not.toBeNull()
})
test.each([
  { totalMinutes: 0, intervalMinutes: null, startBell: true },
  { totalMinutes: 181, intervalMinutes: null, startBell: true },
  { totalMinutes: 2.5, intervalMinutes: null, startBell: true },
  { totalMinutes: 20, intervalMinutes: 0, startBell: true },
  { totalMinutes: 20, intervalMinutes: 61, startBell: true },
  { totalMinutes: 20, intervalMinutes: null, startBell: 'yes' },
  null, 'x', {},
])('rejects %j', input => expect(parseSettings(input)).toBeNull())
