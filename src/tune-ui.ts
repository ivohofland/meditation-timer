import { unlockAudio } from './platform'
import { END_GAP_S, END_STRIKES } from './strikes'
import { type BowlParams, createSynthBell, DEFAULT_BOWL } from './synth-bell'

const params: BowlParams = structuredClone(DEFAULT_BOWL) as BowlParams
const partials = params.partials.map(p => ({ ...p }))
params.partials = partials

let ctx: AudioContext | null = null

function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) {
  const wrap = document.createElement('label')
  wrap.className = 'slider'
  const name = document.createElement('span')
  name.className = 'label'
  name.textContent = label
  const out = document.createElement('output')
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(get())
  const show = () => { out.textContent = String(get()) }
  input.addEventListener('input', () => { set(Number(input.value)); show(); render() })
  show()
  wrap.append(name, out, input)
  parent.append(wrap)
}

const bowl = document.getElementById('bowl')!
slider(bowl, 'Fundamental (Hz)', 150, 500, 1, () => params.fundamentalHz, v => { params.fundamentalHz = v })
slider(bowl, 'Ring time to −60 dB (s)', 5, 60, 1, () => params.t60S, v => { params.t60S = v })
slider(bowl, 'Beat (Hz)', 0, 4, 0.1, () => params.beatHz, v => { params.beatHz = v })

const partialsEl = document.getElementById('partials')!
partials.forEach((p, i) => {
  const group = document.createElement('div')
  group.className = 'partial'
  const title = document.createElement('span')
  title.className = 'label'
  title.textContent = `Partial ${i + 1}`
  group.append(title)
  slider(group, 'Ratio', 1, 8, 0.01, () => p.ratio, v => { p.ratio = v })
  slider(group, 'Level', 0, 1, 0.01, () => p.gain, v => { p.gain = v })
  slider(group, 'Ring time (fraction)', 0.1, 1.5, 0.05, () => p.t60Factor, v => { p.t60Factor = v })
  partialsEl.append(group)
})

const pre = document.getElementById('params')!
function render() {
  const list = partials.map(p => `    { ratio: ${p.ratio}, gain: ${p.gain}, t60Factor: ${p.t60Factor} },`).join('\n')
  pre.textContent = `export const DEFAULT_BOWL: BowlParams = {\n  fundamentalHz: ${params.fundamentalHz},\n  t60S: ${params.t60S},\n  beatHz: ${params.beatHz},\n  partials: [\n${list}\n  ],\n}`
}
render()

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-play]')) {
  button.addEventListener('click', async () => {
    ctx ??= new AudioContext()
    await unlockAudio(ctx, document)
    const bell = createSynthBell(structuredClone(params))
    const at = ctx.currentTime + 0.05
    const kind = button.dataset.play
    if (kind === 'end') {
      for (let n = 0; n < END_STRIKES; n++) bell(ctx, at + n * END_GAP_S, 'full')
    } else {
      bell(ctx, at, kind === 'soft' ? 'soft' : 'full')
    }
  })
}
