# Design

A meditation timer with three settings: total duration, an optional bell
every *x* minutes, and an end. It exists because the timers in commercial
apps (Glo's, among others) ring twice, behave oddly, and cut their sounds off.
This document records what we decided and why. The build steps are in
[`plans/2026-10-31-meditation-timer.md`](plans/2026-10-31-meditation-timer.md).

## Scope

A single static page, plus a tuning page for the bell. No accounts, no
backend, no history.

Not part of fair.yoga. fair.yoga is a business tool for teachers; a practice
timer is a different product and would pull that app toward wellness-app
territory. This repo is separate, linked from fair.yoga's footer, and hosted
at `timer.fair.yoga`.

## Hosting

Static files on fair.yoga's own VPS, served by Nginx: no process, no
container, negligible load. The hardware is shared; nothing that operates it
is. The timer has its own Nginx site file, its own Let's Encrypt certificate,
its own web root and its own deploy path, so a mistake on one side cannot
break the other's deploy, config or certificate renewal. What is shared is
uptime, which is acceptable for a free side tool. `timer.fair.yoga` is its own
origin: no cookies, service workers or storage cross over.

**Never:** session history, streaks, minutes-meditated totals, reminders,
reward badges, or anything else that asks to be opened. The timer is a tool.

## Why other timers fail, and the rule that follows

1. **JavaScript timers drift and duplicate.** `setInterval` callbacks are
   throttled in background tabs, delivered in catch-up bursts when the page
   returns, and duplicated when a component remounts. That is the likely
   source of a bell "playing double".
2. **An interval bell collides with the end.** A 20-minute session with a bell
   every 5 minutes has an interval bell *and* the end bell at 20:00.
3. **Sounds get cut off.** A reused audio player kills the previous strike's
   tail when the next starts; recordings are trimmed early; the room noise
   under a recording stops abruptly when the file ends.

**The rule:** when the user presses Begin, every strike in the session is
computed once and scheduled on the Web Audio clock (`AudioContext.currentTime`),
which is driven by the sound hardware and is sample-accurate. After that, no
JavaScript timer runs. The on-screen countdown reads the same audio clock, so
display and sound cannot disagree. Each strike is its own audio node, so
strikes overlap the way a real bell does and nothing replaces anything.

Interval bells fall strictly before the end: `t < total`.

## The bell

**Two sounds. The bowl opens and closes the sitting; a single ting marks the
interval.** With your eyes closed you can tell them apart at once.

| Moment | Signal |
|---|---|
| Start (optional, on by default) | 1 bowl strike, 20 s after Begin |
| Every *x* minutes | 1 ting |
| End | 3 bowl strikes, 6 s apart, each left to ring |

Start and end follow the practice these timers borrow from: in Zen and Plum
Village traditions a bell marks the transitions, and the number of strikes
says which one. The start bell waits 20 seconds after Begin, time to put the
phone down and settle; the duration is timed from that bell. The settings
screen says so beside the option, and the running screen counts the 20
seconds down ("First bell in 0:20"). Without a start bell the sitting begins
at once.

The interval was first a softer bowl strike (half the level, still ringing
about 27 s). In use it was too long and too loud for a divider: it pulled you
out of the sitting. It is now a ting: one short, high, quiet tone (around
1,760 Hz, gone in about 4.5 s, about a third of the bowl's level). It says
"a block has passed" and nothing more.

**Copy stays plain.** "Bell every 5 minutes", "Three bells to end". No
religious or tradition-specific terms in the interface.

### Synthesis first, recording as fallback

The bell is synthesized: a struck singing bowl is a few decaying sine
partials. Reasons:

- No license to manage. Stock-audio licenses forbid redistributing the raw
  file, which a public repo does; CC0 recordings are fine but must be
  sourced and recorded well.
- A synthesized exponential decay has no edge to cut off and no room noise to
  stop.
- Cheap bowls sound poor; a good one costs a few hundred euros. A synthesizer
  can target what a good bowl does.

What a good bowl does, as numbers:

- a fundamental around 220–440 Hz;
- partials at roughly 2.7× and 5.4× the fundamental (bowls are not harmonic,
  which is the shimmer), higher partials decaying faster;
- a strike attack of about 5 ms, then exponential decay;
- a long sustain (30 s or more to −60 dB on a good bowl, under 10 s on a cheap
  one);
- a slow beat of 0.5–3 Hz from two near-identical modes.

A voice stops when its level is far below audibility (−90 dB, which is 1.5×
the −60 dB time on an exponential decay), never earlier.

If the synthesized bell sounds fake on a phone after real sittings, the
fallback is a recording, made from a borrowed good bowl (a teacher's or a
studio's) and released as CC0, credited in the app. The bell sits behind one
narrow type so that swapping it is one function:

```ts
type Bell = (ctx: BaseAudioContext, at: number, strength: 'soft' | 'full') => Voice
```

A recording, if it comes to that, keeps its full natural decay, has the room
noise cleaned from its tail, ends in a long exponential fade, and is stored
in a high-quality format.

## Platform details

- **iOS needs a gesture.** The `AudioContext` is created or resumed inside the
  Begin tap.
- **iPhone silent switch.** Web Audio is muted by the switch unless a media
  element is playing; a silent looping `<audio>` element started in the same
  tap moves the page into the media-playback category.
- **Screen stays on.** The Screen Wake Lock API, re-requested when the page
  becomes visible again (the browser drops the lock when the page is hidden).
  Unsupported or refused: the timer works anyway.
- **The running screen is dark.** The screen stays on during the sitting,
  often in a dim room; a bright page is the wrong thing to stare past.
- **Stopping early fades.** Every sounding voice fades out over 1.5 s instead
  of stopping dead, which would click.
- **The session ends after the last tail.** The page releases the wake lock
  and closes the audio context only once the last end strike has rung out.
- **Phone locked mid-session.** The Web Audio version stops: the browser
  suspends the page and its audio. The wake lock keeps the screen on instead.
  The stream version below keeps playing.

## The stream version (being compared)

A second engine, at `/stream.html`, plays the whole sitting as a finished HLS
stream through an `<audio>` element. The system media player then keeps it
going with the screen locked, the way a podcast does. Rendering the session as
one uncompressed track was rejected earlier for memory (over 100 MB an hour);
a stream of pre-encoded pieces avoids that.

- **Pieces.** The ting, a bowl strike, the three end strikes mixed into one
  piece (so their tails overlap as before), and silence of 60, 10 and 1 s.
  Rendered from `DEFAULT_BOWL` with the same envelope as the live bell, encoded
  as AAC in MPEG-TS (`pnpm pieces`, needs ffmpeg). Silence is 16 kbps: about
  4 MB an hour.
- **Timing.** Encoded pieces run a few tens of milliseconds long; silence is
  laid out by real lengths, so each bell lands up to a second early and the
  slack never adds up. The countdown reads the stream position, so display and
  sound agree, and scrubbing the system player moves the timer with it.
- **The playlist** is built in the page and handed to the player as a `data:`
  link (6 KB for 20 minutes, 136 KB at worst: 180 minutes, a bell every
  minute). iOS rejects a `blob:` link. Hosting stays static files; the CSP
  already allows `media-src data:`. Nginx serves `.ts` as `video/mp2t` by default.
- **Bells must not overlap.** Pieces play one after another, so a bell's tail
  must end before the next bell: fine for intervals of a minute and up.
- **No wake lock.** The screen may sleep; that is the point.
- **Stop cannot fade on iOS,** where a page cannot set media volume: the sound
  plays on for the release time, then stops.
- **The system player shows the stream's length,** lead-in and ring-out
  included (a 4-minute sitting shows about 5:17).

Tested on an iPhone (2026-10-31): plays with the `data:` playlist, including a
60-minute sitting with a bell every minute, and keeps playing on a locked
screen. Still open: which engine `/` uses on which device, and whether the bell
needs retuning for phone speakers (it sounded thinner on the phone; its 220 Hz
fundamental sits below what small speakers reproduce well).

## Look

fair.yoga's palette and typography for the settings screen (cream page, teal
primary, Georgia headings, system sans body), essentially no motion. The
running screen is a near-black variant with the countdown in a muted tone.
