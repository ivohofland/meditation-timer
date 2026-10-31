import { planStrikes, sittingStartS, START_DELAY_S, type Strike } from './strikes'

const full = (at: number): Strike => ({ at, strength: 'full' })
const soft = (at: number): Strike => ({ at, strength: 'soft' })

test('start bell, no interval', () => {
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: null, startBell: true }))
    .toEqual([full(20), full(620), full(626), full(632)])
})
test('the start bell waits START_DELAY_S, and the sitting is timed from it', () => {
  expect(START_DELAY_S).toBe(20)
  expect(sittingStartS({ totalMinutes: 5, intervalMinutes: 1, startBell: true })).toBe(20)
  expect(sittingStartS({ totalMinutes: 5, intervalMinutes: 1, startBell: false })).toBe(0)
  expect(planStrikes({ totalMinutes: 3, intervalMinutes: 1, startBell: true }))
    .toEqual([full(20), soft(80), soft(140), full(200), full(206), full(212)])
})
test('no start bell', () => {
  expect(planStrikes({ totalMinutes: 1, intervalMinutes: null, startBell: false }))
    .toEqual([full(60), full(66), full(72)])
})
test('interval that divides the total does not ring at the end', () => {
  expect(planStrikes({ totalMinutes: 20, intervalMinutes: 5, startBell: false }))
    .toEqual([soft(300), soft(600), soft(900), full(1200), full(1206), full(1212)])
})
test('interval that does not divide the total', () => {
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: 3, startBell: false }).filter(s => s.strength === 'soft'))
    .toEqual([soft(180), soft(360), soft(540)])
})
test('interval >= total gives no interval strikes', () => {
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: 10, startBell: false }).filter(s => s.strength === 'soft')).toEqual([])
  expect(planStrikes({ totalMinutes: 10, intervalMinutes: 15, startBell: false }).filter(s => s.strength === 'soft')).toEqual([])
})
