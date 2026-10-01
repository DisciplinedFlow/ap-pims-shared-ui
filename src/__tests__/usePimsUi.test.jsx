import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, render, screen } from '@testing-library/react'
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

beforeEach(() => { localStorage.clear(); root.removeAttribute('data-pims-ui'); root.removeAttribute('data-pims-theme'); stubMatchMedia() })
afterEach(() => { vi.restoreAllMocks() })

describe('usePimsUi', () => {
  it('not allowed + stored glass → inactive, no attribute', () => {
    localStorage.setItem('pims.ui.look', 'glass')
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    expect(result.current.active).toBe(false)
    expect(root.hasAttribute('data-pims-ui')).toBe(false)
    expect(result.current.canChoose).toBe(false)
  })
  it('allowed + setLook(glass) → attribute, stored, light under light OS', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
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
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('classic')
    act(() => {
      localStorage.setItem('pims.ui.look', 'glass')
      window.dispatchEvent(new StorageEvent('storage', { key: 'pims.ui.look', newValue: 'glass' }))
    })
    expect(result.current.look).toBe('glass')
    expect(root.getAttribute('data-pims-ui')).toBe('glass')
  })
  it('throwing localStorage still renders classic', async () => {
    vi.resetModules() // fresh in-memory mirror
    const { usePimsUi } = await import('../theme/usePimsUi.js')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const { result } = renderHook(() => usePimsUi({ allowed: true }))
    expect(result.current.look).toBe('classic')
    expect(result.current.active).toBe(false)
    act(() => result.current.setLook('glass'))
    expect(result.current.active).toBe(true)
  })
  it('staff on a production host cannot choose', () => {
    const { result } = renderHook(() => usePimsUi({ allowed: false }))
    act(() => result.current.setLook('glass'))
    expect(result.current.active).toBe(false)
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
})
