import { createSynthBell, DEFAULT_BOWL, DEFAULT_SOUNDS, DEFAULT_TING, FULL_PEAK, RELEASE_S, voiceEnd } from './synth-bell'

type Call = [method: string, ...args: number[]]

function fakeParam(initial = 0) {
  const calls: Call[] = []
  const rec = (name: string) => (...args: number[]) => { calls.push([name, ...args]) }
  return {
    value: initial,
    calls,
    setValueAtTime: rec('set'),
    linearRampToValueAtTime: rec('linear'),
    exponentialRampToValueAtTime: rec('exp'),
    cancelScheduledValues: rec('cancel'),
  }
}

function fakeContext() {
  const oscillators: { frequency: number; startedAt?: number; stoppedAt?: number }[] = []
  const gains: ReturnType<typeof fakeParam>[] = []
  const connections: [unknown, unknown][] = []
  const destination = { name: 'destination' }
  const ctx = {
    currentTime: 0,
    destination,
    createOscillator() {
      const record: (typeof oscillators)[number] = { frequency: 0 }
      oscillators.push(record)
      const node = {
        type: 'sine',
        frequency: {
          get value() { return record.frequency },
          set value(v: number) { record.frequency = v },
          setValueAtTime(v: number) { record.frequency = v },
        },
        connect(to: unknown) { connections.push([node, to]); return to },
        start(t: number) { record.startedAt = t },
        stop(t: number) { record.stoppedAt = t },
      }
      return node
    },
    createGain() {
      const gain = fakeParam(1)
      gains.push(gain)
      const node = { gain, connect(to: unknown) { connections.push([node, to]); return to } }
      return node
    },
  }
  return { ctx: ctx as unknown as BaseAudioContext, oscillators, gains, connections, destination }
}

test('voiceEnd is -90 dB on an exponential decay', () => {
  expect(voiceEnd(10, 30)).toBe(55)
})

test('a full strike sounds every partial plus the beat', () => {
  const { ctx, oscillators } = fakeContext()
  createSynthBell(DEFAULT_SOUNDS)(ctx, 5, 'full')
  const freqs = oscillators.map(o => o.frequency).sort((a, b) => a - b)
  expect(freqs).toHaveLength(4)
  ;[220, 221.5, 596.2, 1188].forEach((f, i) => expect(freqs[i]).toBeCloseTo(f))
  expect(oscillators.every(o => o.startedAt === 5)).toBe(true)
})

test('voice ends at the fundamental voiceEnd and oscillators stop there', () => {
  const { ctx, oscillators } = fakeContext()
  const v = createSynthBell(DEFAULT_SOUNDS)(ctx, 5, 'full')
  expect(v.endsAt).toBe(voiceEnd(5, 30))
  expect(oscillators.every(o => o.stoppedAt === v.endsAt)).toBe(true)
})

test('each partial attacks over ATTACK_S then decays to -90 dB at its own voiceEnd', () => {
  const { ctx, gains } = fakeContext()
  createSynthBell(DEFAULT_SOUNDS)(ctx, 0, 'full')
  const envelopes = gains.filter(g => g.calls.some(c => c[0] === 'exp'))
  expect(envelopes).toHaveLength(4)
  const ends = envelopes.map(g => g.calls.find(c => c[0] === 'exp')![2]).sort((a, b) => a! - b!)
  ;[voiceEnd(0, 9), voiceEnd(0, 15), voiceEnd(0, 30), voiceEnd(0, 30)].forEach((e, i) => expect(ends[i]).toBeCloseTo(e))
  for (const g of envelopes) {
    const [, peak] = g.calls.find(c => c[0] === 'linear')!
    const [, floor] = g.calls.find(c => c[0] === 'exp')!
    expect(floor! / peak!).toBeCloseTo(10 ** (-90 / 20), 8)
  }
})

test('a full strike peaks below 1 in sum', () => {
  const { ctx, gains } = fakeContext()
  createSynthBell(DEFAULT_SOUNDS)(ctx, 0, 'full')
  const peaks = gains.flatMap(g => g.calls.filter(c => c[0] === 'linear').map(c => c[1]!))
  expect(peaks.reduce((a, b) => a + b, 0)).toBeLessThan(1)
})

test('a soft strike is the ting: its own pitch, short and quiet', () => {
  const { ctx, oscillators, gains } = fakeContext()
  const v = createSynthBell(DEFAULT_SOUNDS)(ctx, 0, 'soft')
  const freqs = oscillators.map(o => o.frequency).sort((a, b) => a - b)
  expect(freqs[0]).toBe(DEFAULT_TING.fundamentalHz)
  expect(freqs.every(f => f >= 1000)).toBe(true)
  expect(v.endsAt).toBeCloseTo(voiceEnd(0, DEFAULT_TING.t60S))
  expect(v.endsAt).toBeLessThan(10)
  const peak = gains.flatMap(x => x.calls.filter(c => c[0] === 'linear').map(c => c[1]!)).reduce((a, b) => a + b, 0)
  expect(peak).toBeCloseTo(FULL_PEAK * DEFAULT_TING.level)
  expect(DEFAULT_TING.level).toBeLessThan(DEFAULT_BOWL.level)
})

test('release fades over RELEASE_S and stops the oscillators after it', () => {
  const { ctx, oscillators, gains } = fakeContext()
  const v = createSynthBell(DEFAULT_SOUNDS)(ctx, 0, 'full')
  v.release(10)
  expect(oscillators.every(o => o.stoppedAt === 10 + RELEASE_S)).toBe(true)
  const out = gains.find(g => g.calls.some(c => c[0] === 'cancel'))!
  expect(out.calls).toContainEqual(['linear', 0, 10 + RELEASE_S])
})

test('release before the strike sounds stops it unheard', () => {
  const { ctx, oscillators, gains } = fakeContext()
  const v = createSynthBell(DEFAULT_SOUNDS)(ctx, 20, 'full')
  v.release(19.5)
  expect(oscillators.every(o => o.stoppedAt === 19.5)).toBe(true)
  const out = gains.find(g => g.calls.some(c => c[0] === 'cancel'))
  expect(out?.calls ?? []).not.toContainEqual(['linear', 0, 19.5 + RELEASE_S])
})
