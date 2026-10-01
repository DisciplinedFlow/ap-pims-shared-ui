import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, render, screen, cleanup } from '@testing-library/react'
import { usePimsUi } from '../theme/usePimsUi.js'
import { PimsLookMenu } from '../theme/PimsLookMenu.jsx'

const root = document.documentElement
let dark, listeners
function stubMatchMedia() {
  dark = false; listeners = new Set()
  window.matchMedia = vi.fn(() => ({
    get matches() { return dark },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }))
}
const flipOs = (v) => { dark = v; act(() => { listeners.forEach((fn) => fn({ matches: v })) }) }

const setUrl = (url) => window.history.pushState({}, '', url)
const setHost = (host, qs) => { const real = window.location; Object.defineProperty(window, 'location', { configurable: true, value: { ...real, hostname: host, search: qs } }) }
let realLocation
beforeEach(() => { realLocation = window.location; setUrl('/'); localStorage.clear(); root.removeAttribute('data-pims-ui'); root.removeAttribute('data-pims-theme'); stubMatchMedia() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); if (window.location !== realLocation) Object.defineProperty(window, 'location', { configurable: true, value: realLocation }); setUrl('/') })

describe('usePimsUi', () => {
  it('not allowed + stored glass → inactive, no attribute', () => {
    localStorage.setItem('pims.ui.look', 'glass')
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    expect(result.current.active).toBe(false)
    expect(root.hasAttribute('data-pims-ui')).toBe(false)
    expect(result.current.canChoose).toBe(false)
  })
  it('allowed + empty storage → glass by default', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('glass')
    expect(result.current.active).toBe(true)
    expect(root.getAttribute('data-pims-ui')).toBe('glass')
  })
  it('allowed + stored classic → classic (explicit choice wins)', () => {
    localStorage.setItem('pims.ui.look', 'classic')
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('classic')
    expect(result.current.active).toBe(false)
    expect(root.hasAttribute('data-pims-ui')).toBe(false)
  })
  it('not allowed + empty storage → classic; allowed arriving later flips to glass', () => {
    const { result, rerender } = renderHook(({ a }) => usePimsUi({ allowed: a }), { initialProps: { a: false } })
    expect(result.current.active).toBe(false)
    rerender({ a: true })
    expect(result.current.active).toBe(true)
    rerender({ a: false })
    expect(result.current.active).toBe(false)
  })
  it('allowed + setLook(classic) then setLook(glass) → attribute, stored, light under light OS', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    act(() => result.current.setLook('classic'))
    expect(result.current.active).toBe(false)
    act(() => result.current.setLook('glass'))
    expect(root.getAttribute('data-pims-ui')).toBe('glass')
    expect(root.getAttribute('data-pims-theme')).toBe('light')
    expect(localStorage.getItem('pims.ui.look')).toBe('glass')
    expect(result.current.theme).toBe('system')
  })
  it('OS flipping to dark mid-session moves the attribute', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    act(() => result.current.setLook('glass'))
    flipOs(true)
    expect(root.getAttribute('data-pims-theme')).toBe('dark')
    flipOs(false)
    expect(root.getAttribute('data-pims-theme')).toBe('light')
  })
  it('a theme outside `themes` is ignored', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: true, themes: ['system', 'light', 'dark'] }))
    act(() => result.current.setTheme('field'))
    expect(result.current.theme).toBe('system')
    expect(localStorage.getItem('pims.ui.theme')).toBe(null)
  })
  it('field is accepted when offered', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: true, themes: ['system', 'light', 'dark', 'field'] }))
    act(() => result.current.setLook('glass'))
    act(() => result.current.setTheme('field'))
    expect(root.getAttribute('data-pims-theme')).toBe('field')
  })
  it('a storage event from another tab updates the look', () => {
    localStorage.setItem('pims.ui.look', 'classic')
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('classic')
    act(() => {
      localStorage.setItem('pims.ui.look', 'glass')
      window.dispatchEvent(new StorageEvent('storage', { key: 'pims.ui.look', newValue: 'glass' }))
    })
    expect(result.current.look).toBe('glass')
    expect(root.getAttribute('data-pims-ui')).toBe('glass')
  })
  it('throwing localStorage still renders (default look follows the gate)', async () => {
    vi.resetModules() // fresh in-memory mirror
    const { usePimsUi } = await import('../theme/usePimsUi.js')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('glass')
    expect(result.current.active).toBe(true)
    act(() => result.current.setLook('classic'))
    expect(result.current.active).toBe(false)
  })
  it('staff on a production host cannot choose', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    act(() => result.current.setLook('glass'))
    expect(result.current.active).toBe(false)
  })
})

describe('preview override in the hook', () => {
  it('fresh ?ui=glass on localhost gives active glass for staff with empty storage', () => {
    setUrl('/?ui=glass')
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    expect(result.current.look).toBe('glass')
    expect(result.current.active).toBe(true)
    expect(result.current.canChoose).toBe(true)
    expect(root.getAttribute('data-pims-ui')).toBe('glass')
  })
  it('an explicit setLook clears the override: on ?ui=glass, setLook(classic) turns it off, and back on', () => {
    setUrl('/?ui=glass')
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    expect(result.current.active).toBe(true)
    act(() => result.current.setLook('classic'))
    expect(result.current.active).toBe(false)
    expect(root.hasAttribute('data-pims-ui')).toBe(false)
    expect(result.current.canChoose).toBe(true)
    act(() => result.current.setLook('glass'))
    expect(result.current.active).toBe(true)
  })
  it('the override survives a storage sync and a later URL rewrite', () => {
    setUrl('/?ui=glass')
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    act(() => { window.dispatchEvent(new Event('pims:ui')) })
    setUrl('/?view=x')
    act(() => { window.dispatchEvent(new Event('pims:ui')) })
    expect(result.current.active).toBe(true)
  })
  it('?ui=classic forces off even when stored as glass', () => {
    localStorage.setItem('pims.ui.look', 'glass')
    setUrl('/?ui=classic')
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('classic')
    expect(result.current.active).toBe(false)
    expect(root.hasAttribute('data-pims-ui')).toBe(false)
  })
  it('a production host with ?ui=glass and a staff user stays classic', () => {
    localStorage.setItem('pims.ui.look', 'glass')
    setHost('ap-pims-labor.netlify.app', '?ui=glass')
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    expect(result.current.active).toBe(false)
    expect(result.current.canChoose).toBe(false)
    expect(root.hasAttribute('data-pims-ui')).toBe(false)
  })
})

describe('matchMedia fallback', () => {
  it('uses addListener/removeListener when addEventListener is missing (old Safari)', () => {
    let cb = null
    const removed = vi.fn()
    window.matchMedia = vi.fn(() => ({ get matches() { return dark }, addListener: (fn) => { cb = fn }, removeListener: removed }))
    dark = false
    const { result, unmount } = renderHook(() => usePimsUi({ allowed: true }))
    act(() => result.current.setLook('glass'))
    expect(cb).toBeTypeOf('function')
    dark = true
    act(() => cb({ matches: true }))
    expect(root.getAttribute('data-pims-theme')).toBe('dark')
    unmount()
    expect(removed).toHaveBeenCalledWith(cb)
  })
})

describe('PimsLookMenu', () => {
  it('renders nothing when the user cannot choose', () => {
    const { container } = render(<PimsLookMenu ui={{ canChoose: false }} />)
    expect(container.firstChild).toBeNull()
  })
  it('hides Theme while classic, shows it for glass', () => {
    const base = { canChoose: true, themes: ['system', 'light', 'dark'], theme: 'system', setLook() {}, setTheme() {} }
    const { rerender } = render(<PimsLookMenu ui={{ ...base, look: 'classic' }} />)
    expect(screen.queryByText('Dark')).toBeNull()
    rerender(<PimsLookMenu ui={{ ...base, look: 'glass' }} />)
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(screen.queryByText('Field')).toBeNull()
  })
  it('buttons are at least 44px tall on coarse pointers, in classic too', () => {
    const base = { canChoose: true, themes: ['system', 'light', 'dark'], theme: 'system', look: 'classic', setLook() {}, setTheme() {} }
    window.matchMedia = vi.fn((q) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }))
    const { unmount } = render(<PimsLookMenu ui={base} />)
    expect(screen.getByText('Classic').style.minHeight).toBe('44px')
    unmount()
    window.matchMedia = vi.fn(() => ({ matches: false }))
    render(<PimsLookMenu ui={base} />)
    expect(screen.getByText('Classic').style.minHeight).toBe('')
  })
})
