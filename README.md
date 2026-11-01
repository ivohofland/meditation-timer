# Meditation timer

A calm, open-source meditation timer for the browser. Set a duration and,
if you like, a bell every few minutes. Three bells bring you back at the end.

One bell done well, rather than a menu of sounds. It never rings twice, never
cuts off its own tail, and runs no clock of its own: every strike is scheduled
on the audio clock the moment you press Begin.

Made by the people behind [fair.yoga](https://fair.yoga). Live at
[timer.fair.yoga](https://timer.fair.yoga).

On an iPhone or iPad the bells come as an audio stream, so they keep coming
with the screen locked; everywhere else the page keeps the screen on. Add
`?engine=stream` or `?engine=webaudio` to the address to choose.

## Running it

```bash
pnpm install
pnpm dev      # http://localhost:5173; `pnpm dev --host` to try it on a phone
pnpm test
pnpm build    # static files in dist/
```

`/tune` is the tuning page: every bell, with sliders, to tune the sounds by
ear. `pnpm pieces` renders the stream's pieces in `public/stream/` again after
a change to the sounds (needs ffmpeg).

Deployment: [`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md). A commit on `main`
deploys itself once CI passes.

- Design and the reasoning behind it: [`docs/design.md`](docs/design.md)
- Implementation plan: [`docs/plans/2026-10-31-meditation-timer.md`](docs/plans/2026-10-31-meditation-timer.md)

## License

[AGPL-3.0](LICENSE), the same as fair.yoga.
