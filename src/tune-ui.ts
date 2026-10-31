import { unlockAudio } from './platform'
import { END_GAP_S, END_STRIKES } from './strikes'
import { type BowlParams, createSynthBell, DEFAULT_BOWL, DEFAULT_TING, type Partial as BowlPartial, type Sounds } from './synth-bell'

type Editable = Omit<BowlParams, 'partials'> & { partials: BowlPartial[] }
const editable = (p: BowlParams): Editable => ({ ...p, partials: p.partials.map(x => ({ ...x })) })
const sounds: { full: Editable; soft: Editable } = { full: editable(DEFAULT_BOWL), soft: editable(DEFAULT_TING) }

/** Starting points for the ting, to compare by ear. The last partial of most is a short strike transient. */
const TING_PRESETS: Record<string, BowlParams> = {
  'Small bell': {
    fundamentalHz: 1568, t60S: 5, beatHz: 0, level: 0.4,
    partials: [{ ratio: 1, gain: 1, t60Factor: 1 }, { ratio: 2.32, gain: 0.5, t60Factor: 0.6 }, { ratio: 4.25, gain: 0.3, t60Factor: 0.35 }, { ratio: 6.63, gain: 0.25, t60Factor: 0.08 }],
  },
  Tingsha: {
    fundamentalHz: 1320, t60S: 8, beatHz: 5, level: 0.4,
    partials: [{ ratio: 1, gain: 1, t60Factor: 1 }, { ratio: 2.61, gain: 0.7, t60Factor: 0.6 }, { ratio: 4.92, gain: 0.4, t60Factor: 0.3 }, { ratio: 7.4, gain: 0.25, t60Factor: 0.05 }],
  },
  Glass: {
    fundamentalHz: 1046, t60S: 4, beatHz: 0.8, level: 0.45,
    partials: [{ ratio: 1, gain: 1, t60Factor: 1 }, { ratio: 2.76, gain: 0.25, t60Factor: 0.5 }, { ratio: 5.4, gain: 0.1, t60Factor: 0.25 }],
  },
  Current: DEFAULT_TING,
}

let ctx: AudioContext | null = null

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, onChange: () => void) {
  const wrap = el('label', 'slider')
  const out = el('output')
  const input = el('input')
  Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(get()) })
  const show = () => { out.textContent = String(get()) }
  input.addEventListener('input', () => { set(Number(input.value)); show(); onChange() })
  show()
  wrap.append(el('span', 'label', label), out, input)
  parent.append(wrap)
}

function literal(name: string, p: Editable): string {
  const list = p.partials.map(x => `    { ratio: ${x.ratio}, gain: ${x.gain}, t60Factor: ${x.t60Factor} },`).join('\n')
  return `export const ${name}: BowlParams = {\n  fundamentalHz: ${p.fundamentalHz},\n  t60S: ${p.t60S},\n  beatHz: ${p.beatHz},\n  level: ${p.level},\n  partials: [\n${list}\n  ],\n}`
}

function section(title: string, constName: string, p: Editable, ranges: { hz: [number, number]; t60: [number, number] }) {
  const root = document.getElementById('sounds')!
  const pre = el('pre')
  const render = () => { pre.textContent = literal(constName, p) }

  root.append(el('h2', undefined, title))
  const card = el('div', 'card')
  root.append(card)
  slider(card, 'Fundamental (Hz)', ranges.hz[0], ranges.hz[1], 1, () => p.fundamentalHz, v => { p.fundamentalHz = v }, render)
  slider(card, 'Ring time to −60 dB (s)', ranges.t60[0], ranges.t60[1], 0.5, () => p.t60S, v => { p.t60S = v }, render)
  slider(card, 'Beat (Hz)', 0, 4, 0.1, () => p.beatHz, v => { p.beatHz = v }, render)
  slider(card, 'Level', 0.05, 1, 0.05, () => p.level, v => { p.level = v }, render)
  p.partials.forEach((x, i) => {
    const group = el('div', 'partial')
    group.append(el('span', 'label', `Partial ${i + 1}`))
    slider(group, 'Ratio', 1, 8, 0.01, () => x.ratio, v => { x.ratio = v }, render)
    slider(group, 'Level', 0, 1, 0.01, () => x.gain, v => { x.gain = v }, render)
    slider(group, 'Ring time (fraction)', 0.1, 1.5, 0.05, () => x.t60Factor, v => { x.t60Factor = v }, render)
    card.append(group)
  })
  root.append(el('h2', undefined, `Paste into ${constName}`), pre)
  render()
}

function renderSections() {
  document.getElementById('sounds')!.replaceChildren()
  section('Bowl (start and end)', 'DEFAULT_BOWL', sounds.full, { hz: [150, 500], t60: [5, 60] })
  section('Ting (every few minutes)', 'DEFAULT_TING', sounds.soft, { hz: [600, 4000], t60: [0.5, 15] })
}
renderSections()

async function play(kind: 'soft' | 'full' | 'end') {
  ctx ??= new AudioContext()
  await unlockAudio(ctx, document)
  const bell = createSynthBell(structuredClone(sounds) as Sounds)
  const at = ctx.currentTime + 0.05
  if (kind === 'end') {
    for (let n = 0; n < END_STRIKES; n++) bell(ctx, at + n * END_GAP_S, 'full')
  } else {
    bell(ctx, at, kind)
  }
}

const presets = document.getElementById('ting-presets')!
for (const [name, preset] of Object.entries(TING_PRESETS)) {
  const b = el('button', 'button secondary', name)
  b.type = 'button'
  b.addEventListener('click', () => {
    sounds.soft = editable(preset)
    renderSections()
    void play('soft')
  })
  presets.append(b)
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-play]')) {
  const kind = button.dataset.play
  button.addEventListener('click', () => void play(kind === 'end' ? 'end' : kind === 'soft' ? 'soft' : 'full'))
}
