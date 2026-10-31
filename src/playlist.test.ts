import { buildPlaylist, type Pieces, timeline } from './playlist'

const piece = (name: string, nominalS: number) => ({ uri: `${name}.ts`, nominalS, durationS: nominalS + 0.03 })
const pieces: Pieces = {
  silence: [piece('s60', 60), piece('s10', 10), piece('s1', 1)],
  soft: piece('soft', 27),
  full: piece('full', 45),
  end: piece('end', 57),
}
const isBell = (uri: string) => !/^s\d/.test(uri)

/** Each bell piece's start time, by the pieces' real (encoded) lengths. */
function bells(pieceList: Pieces['silence']) {
  let t = 0
  const out: [string, number][] = []
  for (const p of pieceList) { if (isBell(p.uri)) out.push([p.uri, t]); t += p.durationS }
  return out
}

test('start bell after the lead-in, interval bells, the end piece', () => {
  const tl = timeline({ totalMinutes: 3, intervalMinutes: 1, startBell: true }, pieces)
  const got = bells(tl.pieces)
  expect(got.map(b => b[0])).toEqual(['full.ts', 'soft.ts', 'soft.ts', 'end.ts'])
  ;[20, 80, 140, 200].forEach((target, i) => {
    expect(got[i]![1]).toBeLessThanOrEqual(target)
    expect(got[i]![1]).toBeGreaterThan(target - 1.1)
  })
  expect(tl.sittingStartS).toBe(got[0]![1])
  expect(tl.sittingEndS).toBe(got[3]![1])
  expect(tl.totalS).toBeCloseTo(got[3]![1] + 57.03)
})

test('without a start bell the sitting begins at once', () => {
  const tl = timeline({ totalMinutes: 1, intervalMinutes: null, startBell: false }, pieces)
  expect(tl.sittingStartS).toBe(0)
  expect(bells(tl.pieces).map(b => b[0])).toEqual(['end.ts'])
})

test('encoding slack does not add up over a long sitting', () => {
  const tl = timeline({ totalMinutes: 180, intervalMinutes: null, startBell: false }, pieces)
  expect(tl.sittingEndS).toBeGreaterThan(10800 - 1.1)
  expect(tl.sittingEndS).toBeLessThanOrEqual(10800)
  expect(tl.pieces.length).toBeLessThan(200)
})

test('playlist is a finished VOD playlist with a discontinuity between pieces', () => {
  const m3u8 = buildPlaylist(timeline({ totalMinutes: 1, intervalMinutes: null, startBell: true }, pieces), 'https://x/stream/')
  const lines = m3u8.trim().split('\n')
  expect(lines[0]).toBe('#EXTM3U')
  expect(m3u8).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
  expect(m3u8).toContain('#EXT-X-TARGETDURATION:58')
  expect(lines.at(-1)).toBe('#EXT-X-ENDLIST')
  const uris = lines.filter(l => !l.startsWith('#'))
  expect(uris[0]).toBe('https://x/stream/s10.ts')
  expect(lines.filter(l => l === '#EXT-X-DISCONTINUITY')).toHaveLength(uris.length - 1)
  expect(m3u8).toContain('#EXTINF:45.030000,')
})
