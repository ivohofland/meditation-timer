import { renderStrikes } from './render'
import { ATTACK_S, DEFAULT_BOWL, DEFAULT_SOUNDS, DEFAULT_TING, voiceEnd } from './synth-bell'

const SR = 8000
const peakIn = (d: Float32Array, a: number, b: number) => {
  let p = 0
  for (let i = Math.floor(a * SR); i < Math.min(d.length, Math.floor(b * SR)); i++) p = Math.max(p, Math.abs(d[i]!))
  return p
}

test('renders a strike for exactly the requested length', () => {
  expect(renderStrikes(DEFAULT_SOUNDS, [{ at: 0, strength: 'full' }], 10, SR)).toHaveLength(10 * SR)
})

test('silent before the strike, loud just after the attack', () => {
  const d = renderStrikes(DEFAULT_SOUNDS, [{ at: 1, strength: 'full' }], 3, SR)
  expect(peakIn(d, 0, 0.99)).toBe(0)
  expect(peakIn(d, 1 + ATTACK_S, 1.2)).toBeGreaterThan(0.3)
})

test('decays to -90 dB by voiceEnd and is silent after', () => {
  const end = voiceEnd(0, DEFAULT_BOWL.t60S)
  const d = renderStrikes(DEFAULT_SOUNDS, [{ at: 0, strength: 'full' }], end + 1, SR)
  expect(peakIn(d, end - 0.5, end)).toBeLessThan(10 ** (-85 / 20))
  expect(peakIn(d, end + 0.01, end + 1)).toBe(0)
})

test('overlapping strikes sum and stay below 1', () => {
  const d = renderStrikes(DEFAULT_SOUNDS, [0, 6, 12].map(at => ({ at, strength: 'full' as const })), 20, SR)
  expect(peakIn(d, 0, 20)).toBeLessThan(1)
})

test('a soft strike is the ting: quieter, and silent after its short voiceEnd', () => {
  const full = renderStrikes(DEFAULT_SOUNDS, [{ at: 0, strength: 'full' }], 1, SR)
  const soft = renderStrikes(DEFAULT_SOUNDS, [{ at: 0, strength: 'soft' }], 6, SR)
  expect(peakIn(soft, 0, 1) / peakIn(full, 0, 1)).toBeLessThan(0.5)
  const end = voiceEnd(0, DEFAULT_TING.t60S)
  expect(peakIn(soft, end + 0.01, 6)).toBe(0)
})
