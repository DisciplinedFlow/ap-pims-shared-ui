import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PIMS_TOKENS } from '../tokens/names.js'

const read = (f) => readFileSync(resolve(import.meta.dirname, '../tokens', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Flat list of { selectors, decls, media } for every rule, descending into @media.
function parseRules(css, media = null, out = []) {
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const head = css.slice(i, open).trim()
    let depth = 1, j = open + 1
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++ }
    const body = css.slice(open + 1, j - 1)
    if (head.startsWith('@')) parseRules(body, head, out)
    else out.push({ selectors: head.split(',').map((s) => s.trim()), decls: body, media })
    i = j
  }
  return out
}
const declsOf = (body) => Object.fromEntries([...body.matchAll(/(--pims-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1].slice(7), m[2].trim()]))

const files = { 'tokens.css': read('tokens.css'), 'base.css': read('base.css') }
const SCOPE = ':root[data-pims-ui="glass"]'

describe('scoping', () => {
  for (const [name, css] of Object.entries(files)) {
    it(`${name}: every selector is scoped under the glass attribute`, () => {
      const rules = parseRules(css)
      expect(rules.length).toBeGreaterThan(0)
      for (const r of rules) for (const s of r.selectors) expect(s.startsWith(SCOPE), `${name}: ${s}`).toBe(true)
    })
    it(`${name}: no --pims- declaration outside a scoped rule`, () => {
      const rules = parseRules(css)
      const inRules = rules.reduce((n, r) => n + (r.decls.match(/--pims-[a-z0-9-]+\s*:/g) || []).length, 0)
      expect((css.match(/--pims-[a-z0-9-]+\s*:/g) || []).length).toBe(inRules)
    })
    it(`${name}: nothing targets :root alone`, () => {
      for (const r of parseRules(css)) for (const s of r.selectors) expect(s).not.toMatch(/^(:root|html|body)\s*$/)
    })
  }
})

const blocks = parseRules(files['tokens.css'])
const pick = (sel) => declsOf(blocks.find((r) => r.selectors[0] === sel && r.media === '@media screen').decls)
const light = pick(SCOPE)
const darkOnly = pick(`${SCOPE}[data-pims-theme="dark"]`)
const fieldOnly = pick(`${SCOPE}[data-pims-theme="field"]`)
const dark = { ...light, ...darkOnly }
const field = { ...light, ...fieldOnly }
const parseColourLoose = (v) => /^#[0-9a-f]{6}$/i.test(v)
const isColour = (v) => /^(#|rgba?\()/.test(v)

describe('base.css print', () => {
  const rules = parseRules(files['base.css'])
  it('has no rule that applies in print', () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) expect(r.media && r.media.startsWith('@media screen'), r.selectors[0]).toBe(true)
    expect(files['base.css']).not.toMatch(/@media[^{]*print/)
  })
  it('declares no colour literal outside @media screen', () => {
    const outside = files['base.css'].replace(/@media screen\s*\{[\s\S]*\}\s*$/, '')
    expect(outside).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black)\b/i)
  })
})

describe('print', () => {
  it('tokens.css defines no --pims- token outside @media screen (print gets classic fallbacks)', () => {
    for (const r of blocks) {
      if (/--pims-[a-z0-9-]+\s*:/.test(r.decls)) expect(r.media && r.media.startsWith('@media screen'), r.selectors[0]).toBe(true)
    }
    expect(blocks.some((r) => r.media && /print/.test(r.media))).toBe(false)
  })
})

describe('reduced transparency', () => {
  it('dark and field themes get a solid surface too, with specificity at least that of the theme block', () => {
    const rt = blocks.filter((r) => r.media && r.media.includes('prefers-reduced-transparency'))
    for (const theme of ['dark', 'field']) {
      const sel = `${SCOPE}[data-pims-theme="${theme}"]`
      const rule = rt.find((r) => r.selectors.includes(sel))
      expect(rule, theme).toBeDefined()
      const d = declsOf(rule.decls)
      expect(d.surface).toBe('var(--pims-surface-solid)')
      expect(d.blur).toBe('none')
    }
  })
  it('field has an opaque surface-solid to fall back on', () => {
    expect(isColour(field['surface-solid']) && parseColourLoose(field['surface-solid'])).toBeTruthy()
  })
})

describe('token coverage', () => {
  it('every PIMS_TOKENS name is defined in light', () => {
    for (const n of PIMS_TOKENS) expect(light[n], n).toBeDefined()
  })
  it('light defines nothing outside PIMS_TOKENS', () => {
    for (const n of Object.keys(light)) expect(PIMS_TOKENS).toContain(n)
  })
  it('dark resolves every token and overrides every colour token', () => {
    for (const n of PIMS_TOKENS) expect(dark[n], n).toBeDefined()
    for (const n of PIMS_TOKENS) if (isColour(light[n])) expect(darkOnly[n], `dark override ${n}`).toBeDefined()
  })
  it('field resolves every token', () => {
    for (const n of PIMS_TOKENS) expect(field[n], n).toBeDefined()
  })
})

// WCAG helpers
function parseColour(v) {
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 }
  m = v.match(/^rgba?\(([^)]+)\)$/)
  if (!m) throw new Error(`cannot parse colour: ${v}`)
  const p = m[1].split(',').map((s) => parseFloat(s))
  return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
}
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1,
})
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('contrast (WCAG AA 4.5:1)', () => {
  for (const [name, t] of Object.entries({ light, dark, field })) {
    const base = parseColour(t['bg-base'])
    const surface = over(parseColour(t.surface), base)
    it(`${name}: text on surface`, () => {
      for (const k of ['ink', 'text-2', 'text-3']) expect(ratio(parseColour(t[k]), surface), `${name} ${k}`).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name}: text-3 on bare bg-base`, () => {
      expect(ratio(parseColour(t['text-3']), base), `${name} text-3`).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name}: field-border is at least 3:1 on field (over bg-base) and on surface-solid`, () => {
      const fb = parseColour(t['field-border'])
      expect(fb.a, 'field-border must be solid').toBe(1)
      const fieldBg = over(parseColour(t.field), base)
      expect(ratio(fb, fieldBg), `${name} vs field`).toBeGreaterThanOrEqual(3)
      expect(ratio(fb, parseColour(t['surface-solid'])), `${name} vs surface-solid`).toBeGreaterThanOrEqual(3)
    })
    it(`${name}: text on the background gradient peaks`, () => {
      const stops = [...t['bg-image'].matchAll(/(#[0-9a-f]{6})\s+0/gi)].map((m) => parseColour(m[1]))
      for (const g of stops) for (const k of ['ink', 'text-2', 'text-3']) expect(ratio(parseColour(t[k]), g), `${name} ${k}`).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name}: status text on its soft background`, () => {
      for (const k of ['info', 'warn', 'danger', 'ok']) {
        const bg = over(parseColour(t[`${k}-soft`]), surface)
        expect(ratio(parseColour(t[k]), bg), `${name} ${k}`).toBeGreaterThanOrEqual(4.5)
      }
    })
    it(`${name}: on-primary on both gradient stops`, () => {
      for (const k of ['primary-from', 'primary-to']) expect(ratio(parseColour(t['on-primary']), parseColour(t[k])), `${name} ${k}`).toBeGreaterThanOrEqual(4.5)
    })
  }
})
