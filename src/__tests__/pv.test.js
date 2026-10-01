import { describe, it, expect } from 'vitest'
import { pv } from '../tokens/pv.js'
import { PIMS_TOKENS } from '../tokens/names.js'
describe('pv', () => {
  it('wraps a string fallback verbatim', () => {
    expect(pv('surface', '#fff')).toBe('var(--pims-surface, #fff)')
  })
  it('turns numbers into px so React numeric styles keep meaning', () => {
    expect(pv('r-btn', 8)).toBe('var(--pims-r-btn, 8px)')
    expect(pv('r-btn', 0)).toBe('var(--pims-r-btn, 0px)')
  })
  it('throws on an unknown token name', () => {
    expect(() => pv('surfase', '#fff')).toThrow(/unknown pims token/i)
  })
  it('every name is kebab-case', () => {
    for (const n of PIMS_TOKENS) expect(n).toMatch(/^[a-z][a-z0-9-]*$/)
  })
})
