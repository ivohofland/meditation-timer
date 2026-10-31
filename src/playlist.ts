import type { Settings } from './settings'
import { END_STRIKES, planStrikes } from './strikes'

/** One pre-rendered audio file the stream is stitched from. */
export interface Piece {
  uri: string
  /** Length the piece was rendered to, in whole seconds. */
  nominalS: number
  /** Length of the encoded file, as the player will play it; used to place bells. */
  durationS: number
}

export interface Pieces {
  /** Silence pieces, longest first; the last must be 1 s. */
  silence: readonly Piece[]
  soft: Piece
  full: Piece
  /** The three end strikes, mixed into one piece so their tails overlap. */
  end: Piece
}

/** One session as pieces, with its moments in seconds of stream time (real, encoded lengths). */
export interface Timeline {
  pieces: Piece[]
  /** Where the start bell sounds; 0 without one. */
  sittingStartS: number
  /** Where the end strikes begin. */
  sittingEndS: number
  /** Length of the whole stream, to the end's last tail. */
  totalS: number
}

/**
 * Lays a session out as pieces. Silence fills each gap by the pieces' real
 * lengths, so each bell lands within a second of its planned time, never later,
 * and encoder slack does not accumulate over a long sitting.
 */
export function timeline(settings: Settings, pieces: Pieces): Timeline {
  const strikes = planStrikes(settings)
  const bells = strikes.slice(0, -END_STRIKES).map(s => ({ at: s.at, piece: s.strength === 'soft' ? pieces.soft : pieces.full }))
  bells.push({ at: strikes.at(-END_STRIKES)?.at ?? 0, piece: pieces.end })

  const out: Piece[] = []
  const starts: number[] = []
  let cursor = 0
  for (const { at, piece } of bells) {
    if (cursor > at) throw new Error(`bell at ${at} s overlaps the previous piece`)
    for (const s of pieces.silence) {
      while (at - cursor >= s.durationS) { out.push(s); cursor += s.durationS }
    }
    starts.push(cursor)
    out.push(piece)
    cursor += piece.durationS
  }
  return {
    pieces: out,
    sittingStartS: settings.startBell ? starts[0]! : 0,
    sittingEndS: starts.at(-1)!,
    totalS: cursor,
  }
}

/** A finished (VOD) HLS playlist. Pieces are separate encodes, so each starts a discontinuity. */
export function buildPlaylist(tl: Timeline, base: string): string {
  const target = Math.ceil(Math.max(...tl.pieces.map(p => p.durationS)))
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-PLAYLIST-TYPE:VOD', `#EXT-X-TARGETDURATION:${target}`, '#EXT-X-MEDIA-SEQUENCE:0']
  tl.pieces.forEach((p, i) => {
    if (i > 0) lines.push('#EXT-X-DISCONTINUITY')
    lines.push(`#EXTINF:${p.durationS.toFixed(6)},`, base + p.uri)
  })
  lines.push('#EXT-X-ENDLIST')
  return lines.join('\n') + '\n'
}
