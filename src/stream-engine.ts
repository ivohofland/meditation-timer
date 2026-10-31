import { buildPlaylist, type Pieces, timeline } from './playlist'
import type { Settings } from './settings'
import pieces from './stream-pieces.json'
import { StreamSession } from './stream-session'

let audio: HTMLAudioElement | null = null

/** Where the session's playlist comes from: built in the page, or served. */
export type PlaylistSource = 'page' | 'server'

export const HLS_TYPE = 'application/vnd.apple.mpegurl'

/** Whether this browser plays HLS in a plain <audio> element. */
export const playsHls = (): boolean => document.createElement('audio').canPlayType(HLS_TYPE) !== ''

function playlistSource(): PlaylistSource {
  const el = document.getElementById('playlist-source') as HTMLSelectElement | null
  return el?.value === 'page' ? 'page' : 'server'
}

/**
 * The stream engine: the whole sitting as one finished HLS stream through an
 * <audio> element. Synchronous up to play(), so it starts inside the tap.
 */
export function beginStream(settings: Settings) {
  audio ??= Object.assign(document.createElement('audio'), { preload: 'auto' })
  audio.setAttribute('playsinline', '')
  const tl = timeline(settings, pieces as Pieces)

  let blobUrl: string | null = null
  let url: string
  if (playlistSource() === 'page') {
    const m3u8 = buildPlaylist(tl, `${location.origin}/stream/`)
    url = blobUrl = URL.createObjectURL(new Blob([m3u8], { type: HLS_TYPE }))
  } else {
    const q = new URLSearchParams({
      total: String(settings.totalMinutes),
      interval: settings.intervalMinutes === null ? '' : String(settings.intervalMinutes),
      start: settings.startBell ? '1' : '0',
    })
    url = `/stream/session.m3u8?${q}`
  }

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
    finish() {
      el.pause()
      el.removeAttribute('src')
      el.load()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    },
  })
}
