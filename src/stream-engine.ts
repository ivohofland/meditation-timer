import { buildPlaylist, type Pieces, timeline } from './playlist'
import type { Settings } from './settings'
import pieces from './stream-pieces.json'
import { StreamSession } from './stream-session'

let audio: HTMLAudioElement | null = null

export const HLS_TYPE = 'application/vnd.apple.mpegurl'

/**
 * The stream engine: the whole sitting as one finished HLS stream through an
 * <audio> element. Synchronous up to play(), so it starts inside the tap.
 */
export function beginStream(settings: Settings) {
  audio ??= Object.assign(document.createElement('audio'), { preload: 'auto' })
  audio.setAttribute('playsinline', '')
  const tl = timeline(settings, pieces as Pieces)

  // The playlist travels in a data: link: iOS's player rejects blob: links, and
  // this keeps hosting to static files. Piece links must be absolute in it.
  const m3u8 = buildPlaylist(tl, `${location.origin}/stream/`)
  const url = `data:${HLS_TYPE};base64,${btoa(m3u8)}`

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Meditation timer', artist: `${settings.totalMinutes} minutes` })
  }

  const el = audio
  const session = new StreamSession(el, tl, settings.totalMinutes * 60, url)
  session.start()
  return Promise.resolve({
    state: () => session.state(),
    remainingS: () => session.remainingS(),
    leadInS: () => session.leadInS(),
    stop: () => session.stop(),
    tick: () => session.tick(),
    released: () => session.released(),
    error: () => session.error(),
    warning: () => null,
    finish() {
      el.pause()
      el.removeAttribute('src')
      el.load()
    },
  })
}
