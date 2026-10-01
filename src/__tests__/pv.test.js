import { describe, it, expect, vi, afterEach } from 'vitest'
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
  describe('in production', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
    it('does not throw on an unknown name: returns the classic fallback and warns once', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(pv('prod-only-typo', '#fff')).toBe('var(--pims-prod-only-typo, #fff)')
      expect(pv('prod-only-typo', 8)).toBe('var(--pims-prod-only-typo, 8px)')
      expect(warn).toHaveBeenCalledTimes(1)
    })
    it('still throws when NODE_ENV is not production', () => {
      vi.stubEnv('NODE_ENV', 'development')
      expect(() => pv('surfase', '#fff')).toThrow(/unknown pims token/i)
    })
  })
})
