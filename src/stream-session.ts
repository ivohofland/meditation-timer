import type { Timeline } from './playlist'
import type { SessionState } from './session'
import { RELEASE_S } from './synth-bell'

/** The parts of an <audio> element the stream session uses. */
export type MediaLike = Pick<HTMLMediaElement, 'src' | 'currentTime' | 'volume' | 'ended' | 'error' | 'play' | 'pause'>

/**
 * One sitting played as a finished HLS stream through an <audio> element, so
 * the system media player keeps it going with the screen locked. State and
 * countdown are read from the stream position, the way Session reads the
 * audio clock.
 */
export class StreamSession {
  readonly #audio: MediaLike
  readonly #tl: Timeline
  readonly #durationS: number
  readonly #url: string
  readonly #now: () => number
  #started = false
  #stoppedAt: number | null = null
  #released = false
  #error: string | null = null

  constructor(audio: MediaLike, tl: Timeline, durationS: number, url: string, now: () => number = () => performance.now()) {
    this.#audio = audio
    this.#tl = tl
    this.#durationS = durationS
    this.#url = url
    this.#now = now
  }

  /** Call inside the user's tap. */
  start(): void {
    if (this.#started) return
    this.#started = true
    this.#audio.volume = 1
    this.#audio.src = this.#url
    this.#audio.play().catch((e: unknown) => {
      this.#error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    })
  }

  stop(): void {
    const state = this.state()
    if (state === 'done' || state === 'stopped') return
    this.#stoppedAt = this.#now()
  }

  /** Advances the fade after stop(); call once per frame. */
  tick(): void {
    if (this.#stoppedAt === null || this.#released) return
    const t = (this.#now() - this.#stoppedAt) / (RELEASE_S * 1000)
    if (t >= 1) {
      this.#audio.pause()
      this.#released = true
    } else {
      // Has no effect on iOS, where a page cannot set media volume.
      this.#audio.volume = Math.max(0, 1 - t)
    }
  }

  /** True once a stopped session has faded out and paused. */
  released(): boolean {
    return this.#released
  }

  error(): string | null {
    const e = this.#audio.error
    if (e) return `Playback error ${e.code}${e.message ? `: ${e.message}` : ''}`
    return this.#error
  }

  state(): SessionState {
    if (this.#stoppedAt !== null) return 'stopped'
    if (!this.#started) return 'idle'
    if (this.error() !== null || this.#audio.ended) return 'done'
    const t = this.#audio.currentTime
    if (t < this.#tl.sittingStartS) return 'settling'
    if (t < this.#tl.sittingEndS) return 'running'
    if (t < this.#tl.totalS) return 'ringing-out'
    return 'done'
  }

  remainingS(): number {
    if (!this.#started) return this.#durationS
    return Math.min(this.#durationS, Math.max(0, this.#tl.sittingEndS - this.#audio.currentTime))
  }

  leadInS(): number {
    if (!this.#started) return this.#tl.sittingStartS
    return Math.max(0, this.#tl.sittingStartS - this.#audio.currentTime)
  }
}
