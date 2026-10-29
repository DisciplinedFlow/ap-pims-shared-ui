import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolveAllowed, fetchUiAllowed, previewOverride, resolveTheme, applyUi, UI_ATTR, THEME_ATTR } from '../theme/uiTheme.js'
describe('resolveAllowed', () => {
  it('owner without registry entry → allowed', () => expect(resolveAllowed({ role: 'owner', features: [] })).toBe(true))
  it('staff without registry entry → not allowed', () => expect(resolveAllowed({ role: 'pm', features: [] })).toBe(false))
  it('registry answer wins (array)', () => expect(resolveAllowed({ role: 'pm', features: ['ui_glass'] })).toBe(true))
  it('registry answer wins (map, false for owner)', () => expect(resolveAllowed({ role: 'owner', features: { ui_glass: false } })).toBe(false))
  it('map true for staff → allowed', () => expect(resolveAllowed({ role: 'pm', features: { ui_glass: true } })).toBe(true))
  it('map without the key → role fallback', () => expect(resolveAllowed({ role: 'pm', features: { team_chat: true } })).toBe(false))
  it('null features → role fallback', () => expect(resolveAllowed({ role: 'owner', features: null })).toBe(true))
  // Open item 3 (PR #2): the shape fn_my_features_v1 really returns, and the shapes it might return if changed.
  describe('fn_my_features_v1 result shapes', () => {
    it('the real shape (RETURNS jsonb, jsonb_object_agg): { key: boolean } decides for staff and owner', () => {
      const real = { ui_glass: true, team_chat: false, document_center: true }
      expect(resolveAllowed({ role: 'pm', features: real })).toBe(true)
      expect(resolveAllowed({ role: 'owner', features: { ...real, ui_glass: false } })).toBe(false)
    })
    it('empty registry ({}): role default', () => {
      expect(resolveAllowed({ role: 'pm', features: {} })).toBe(false)
      expect(resolveAllowed({ role: 'owner', features: {} })).toBe(true)
    })
    it('rows [{ feature_key, enabled }] are read, not dropped to the role default', () => {
      expect(resolveAllowed({ role: 'pm', features: [{ feature_key: 'team_chat', enabled: false }, { feature_key: 'ui_glass', enabled: true }] })).toBe(true)
      expect(resolveAllowed({ role: 'owner', features: [{ feature_key: 'ui_glass', enabled: false }] })).toBe(false)
      expect(resolveAllowed({ role: 'pm', features: [{ feature_key: 'ui_glass', allowed: true }] })).toBe(true)
    })
    it('rows without ui_glass, or junk entries: role default', () => {
      expect(resolveAllowed({ role: 'pm', features: [null, 3, { feature_key: 'team_chat', enabled: true }] })).toBe(false)
      expect(resolveAllowed({ role: 'owner', features: [null] })).toBe(true)
    })
    it('a non-boolean value is not a yes', () => {
      expect(resolveAllowed({ role: 'pm', features: { ui_glass: 'true' } })).toBe(false)
      expect(resolveAllowed({ role: 'pm', features: [{ feature_key: 'ui_glass', enabled: 'yes' }] })).toBe(false)
    })
  })
})
describe('fetchUiAllowed', () => {
  let log
  beforeEach(() => { log = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => log.mockRestore())
  const sb = (res) => ({ rpc: async (n) => { expect(n).toBe('fn_my_features_v1'); if (res instanceof Error) throw res; return res } })
  it('reads the map', async () => expect(await fetchUiAllowed(sb({ data: { ui_glass: true }, error: null }), 'pm')).toBe(true))
  it('absent key → owner only', async () => {
    expect(await fetchUiAllowed(sb({ data: { team_chat: true }, error: null }), 'owner')).toBe(true)
    expect(await fetchUiAllowed(sb({ data: { team_chat: true }, error: null }), 'pm')).toBe(false)
  })
  it('error → owner only', async () => {
    expect(await fetchUiAllowed(sb({ data: null, error: { message: 'x' } }), 'owner')).toBe(true)
    expect(await fetchUiAllowed(sb({ data: null, error: { message: 'x' } }), 'pm')).toBe(false)
  })
  it('throw → owner only', async () => expect(await fetchUiAllowed(sb(new Error('net')), 'pm')).toBe(false))
  it('error and throw are logged, not swallowed', async () => {
    await fetchUiAllowed(sb({ data: null, error: { message: 'x' } }), 'pm')
    await fetchUiAllowed(sb(new Error('net')), 'owner')
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[0][0]).toMatch(/fn_my_features_v1/)
    expect(log.mock.calls[1][0]).toMatch(/fn_my_features_v1/)
  })
  it('a successful check logs nothing', async () => {
    await fetchUiAllowed(sb({ data: { ui_glass: true }, error: null }), 'pm')
    expect(log).not.toHaveBeenCalled()
  })
})
describe('previewOverride', () => {
  const at = (href) => new URL(href)
  it('localhost ?ui=glass', () => expect(previewOverride(at('http://localhost:5173/?ui=glass'))).toBe('glass'))
  it('deploy preview ?ui=classic', () => expect(previewOverride(at('https://deploy-preview-64--ap-pims-labor.netlify.app/?ui=classic'))).toBe('classic'))
  it('production host ignores it', () => expect(previewOverride(at('https://ap-pims-labor.netlify.app/?ui=glass'))).toBe(null))
  it('no param → null', () => expect(previewOverride(at('http://localhost:5173/'))).toBe(null))
  it('junk value → null', () => expect(previewOverride(at('http://localhost:5173/?ui=neon'))).toBe(null))
})
describe('resolveTheme', () => {
  it('system follows OS', () => { expect(resolveTheme('system', true)).toBe('dark'); expect(resolveTheme('system', false)).toBe('light') })
  it('explicit wins', () => { expect(resolveTheme('dark', false)).toBe('dark'); expect(resolveTheme('field', true)).toBe('field') })
  it('unknown behaves like system', () => { expect(resolveTheme('neon', true)).toBe('dark'); expect(resolveTheme('neon', false)).toBe('light') })
})
describe('applyUi', () => {
  beforeEach(() => { document.documentElement.removeAttribute(UI_ATTR); document.documentElement.removeAttribute(THEME_ATTR); document.head.innerHTML = '' })
  it('active sets both attributes', () => {
    applyUi({ active: true, theme: 'dark' })
    expect(document.documentElement.getAttribute(UI_ATTR)).toBe('glass')
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe('dark')
  })
  it('inactive removes both (classic untouched)', () => {
    applyUi({ active: true, theme: 'dark' }); applyUi({ active: false, theme: 'dark' })
    expect(document.documentElement.hasAttribute(UI_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(THEME_ATTR)).toBe(false)
  })
  it('syncs theme-color and restores the original on classic', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#123456">'
    const m = () => document.querySelector('meta[name="theme-color"]').getAttribute('content')
    applyUi({ active: true, theme: 'light' }); expect(m()).toBe('#F3F5F9')
    applyUi({ active: true, theme: 'dark' }); expect(m()).toBe('#0A0D14')
    applyUi({ active: true, theme: 'field' }); expect(m()).toBe('#FFFFFF')
    applyUi({ active: false, theme: 'field' }); expect(m()).toBe('#123456')
  })
})
