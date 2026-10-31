/**
 * Keeps the screen on with the Screen Wake Lock API. The browser drops the lock
 * whenever the page is hidden, so it is requested again when the page returns.
 * Unsupported or refused: the timer works anyway.
 */
export function keepAwake(nav: Navigator, doc: Document): { release(): void } {
  const wakeLock = (nav as Partial<Pick<Navigator, 'wakeLock'>>).wakeLock
  if (!wakeLock) return { release() {} }

  let held: WakeLockSentinel | null = null
  let released = false

  const request = () => {
    wakeLock.request('screen').then(
      sentinel => {
        if (released) sentinel.release().catch(() => {})
        else held = sentinel
      },
      () => {},
    )
  }
  const onVisibility = () => {
    if (!released && doc.visibilityState === 'visible') request()
  }

  doc.addEventListener('visibilitychange', onVisibility)
  request()

  return {
    release() {
      if (released) return
      released = true
      doc.removeEventListener('visibilitychange', onVisibility)
      held?.release().catch(() => {})
      held = null
    },
  }
}

/** One second of 8-bit mono silence at 8 kHz, as a WAV data: URI. */
function silentWav(): string {
  const rate = 8000
  const n = rate
  const bytes = new Uint8Array(44 + n)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i) }
  ascii(0, 'RIFF'); view.setUint32(4, 36 + n, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true)
  ascii(36, 'data'); view.setUint32(40, n, true)
  bytes.fill(0x80, 44)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:audio/wav;base64,${btoa(bin)}`
}

let silence: HTMLAudioElement | null = null

/**
 * Call inside the user's tap. Resumes the context and starts a looping silent
 * <audio> element, which moves the page into the media-playback category so
 * the iPhone silent switch does not mute Web Audio.
 */
export async function unlockAudio(ctx: AudioContext, doc: Document): Promise<void> {
  if (!silence) {
    silence = doc.createElement('audio')
    silence.src = silentWav()
    silence.loop = true
    silence.setAttribute('playsinline', '')
    ;(silence as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  }
  const playing = silence.play().catch(() => {})
  await Promise.all([ctx.resume().catch(() => {}), playing])
}
