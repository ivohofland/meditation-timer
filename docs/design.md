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

**One sound, three uses. The pattern carries the meaning, not the timbre.**
With your eyes closed you can count, not read.

| Moment | Signal |
|---|---|
| Start (optional, on by default) | 1 full strike |
| Every *x* minutes | 1 soft strike |
| End | 3 full strikes, 6 s apart, each left to ring |

This follows the practice these timers borrow from: in Zen and Plum Village
traditions a single bell marks every transition, and the number of strikes
says which one. The soft strike is about half the volume and rings shorter;
it tells you where you are without pulling you out.

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
- **Phone locked mid-session.** Not designed for. Keeping audio alive on a
  locked screen means rendering the whole session as one media stream, which
  costs over 100 MB of memory per hour of uncompressed audio. The wake lock
  keeps the screen on instead.

## Look

fair.yoga's palette and typography for the settings screen (cream page, teal
primary, Georgia headings, system sans body), essentially no motion. The
running screen is a near-black variant with the countdown in a muted tone.
