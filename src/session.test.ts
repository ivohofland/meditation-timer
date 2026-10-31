import type { Bell, Strength } from './bell'
import { Session } from './session'
import type { Settings } from './settings'

const settings1min: Settings = { totalMinutes: 1, intervalMinutes: null, startBell: true }

/** Fake voices ring for 40 s after their strike. */
function fakes(clock: { currentTime: number }) {
  const calls: [number, Strength][] = []
  const voices: { endsAt: number; release: ReturnType<typeof vi.fn> }[] = []
  const bell: Bell = (_ctx, at, strength) => {
    calls.push([at, strength])
    const v = { endsAt: at + 40, release: vi.fn() }
    voices.push(v)
    return v
  }
  return { ctx: clock as unknown as BaseAudioContext & { currentTime: number }, clock, bell, calls, voices }
}

test('start schedules every planned strike once, offset by t0', () => {
  const { ctx, bell, calls } = fakes({ currentTime: 2 })
  const s = new Session(ctx, bell, settings1min)
  s.start()
  expect(calls.map(([at, st]) => [Number(at.toFixed(6)), st]))
    .toEqual([[22.1, 'full'], [82.1, 'full'], [88.1, 'full'], [94.1, 'full']])
})

test('a second start does nothing', () => {
  const { ctx, bell, calls } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  s.start(); s.start()
  expect(calls).toHaveLength(4)
})

test('state and remaining follow the clock', () => {
  const { ctx, clock, bell } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  expect(s.state()).toBe('idle'); expect(s.remainingS()).toBe(60); expect(s.leadInS()).toBe(20)
  s.start()
  clock.currentTime = 10; expect(s.state()).toBe('settling'); expect(s.remainingS()).toBe(60); expect(s.leadInS()).toBeCloseTo(10.1)
  clock.currentTime = 50.1; expect(s.state()).toBe('running'); expect(s.remainingS()).toBeCloseTo(30); expect(s.leadInS()).toBe(0)
  clock.currentTime = 81; expect(s.state()).toBe('ringing-out'); expect(s.remainingS()).toBe(0)
  clock.currentTime = 200; expect(s.state()).toBe('done')
})

test('stop during ring-out releases only voices still sounding', () => {
  const { ctx, clock, bell, voices } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  s.start()
  clock.currentTime = 90
  s.stop()
  expect(voices.map(v => v.release.mock.calls)).toEqual([[], [[90]], [[90]], [[90]]])
  expect(s.state()).toBe('stopped')
})

test('without a start bell there is no lead-in', () => {
  const { ctx, clock, bell } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, { totalMinutes: 1, intervalMinutes: null, startBell: false })
  expect(s.leadInS()).toBe(0)
  s.start()
  clock.currentTime = 0.2; expect(s.state()).toBe('running')
})

test('stop after done does nothing', () => {
  const { ctx, clock, bell, voices } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  s.start()
  clock.currentTime = 500
  s.stop()
  expect(voices.every(v => v.release.mock.calls.length === 0)).toBe(true)
  expect(s.state()).toBe('done')
})

test('a second stop does not release again', () => {
  const { ctx, clock, bell, voices } = fakes({ currentTime: 0 })
  const s = new Session(ctx, bell, settings1min)
  s.start()
  clock.currentTime = 10
  s.stop(); s.stop()
  expect(voices.every(v => v.release.mock.calls.length === 1)).toBe(true)
})
