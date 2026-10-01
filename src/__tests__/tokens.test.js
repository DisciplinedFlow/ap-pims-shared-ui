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
const pick = (sel) => declsOf(blocks.find((r) => r.selectors[0] === sel && !r.media).decls)
const light = pick(SCOPE)
const darkOnly = pick(`${SCOPE}[data-pims-theme="dark"]`)
const fieldOnly = pick(`${SCOPE}[data-pims-theme="field"]`)
const dark = { ...light, ...darkOnly }
const field = { ...light, ...fieldOnly }
const isColour = (v) => /^(#|rgba?\()/.test(v)

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
