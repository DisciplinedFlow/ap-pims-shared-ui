import { useCallback, useEffect, useState } from 'react'
import { LOOK_KEY, THEME_KEY, applyUi, previewOverride, resolveTheme } from './uiTheme.js'

const EVENT = 'pims:ui'
const DARK_QUERY = '(prefers-color-scheme: dark)'

// In-memory mirror so a view with blocked storage (private mode) still honours the choice it just made.
const mem = {}
function read(key, fallback) {
  try { return globalThis.localStorage?.getItem(key) || fallback } catch { return mem[key] || fallback }
}
function write(key, value) {
  mem[key] = value
  try { globalThis.localStorage?.setItem(key, value) } catch { /* private mode: works for this view only */ }
}
function osDark() {
  try { return !!globalThis.matchMedia?.(DARK_QUERY)?.matches } catch { return false }
}
const readLook = () => (read(LOOK_KEY, 'classic') === 'glass' ? 'glass' : 'classic')

export function usePimsUi({ allowed, themes = ['system', 'light', 'dark'] } = {}) {
  const override = previewOverride()
  const [look, setLookState] = useState(readLook)
  const [theme, setThemeState] = useState(() => read(THEME_KEY, 'system'))
  const [dark, setDark] = useState(osDark)

  useEffect(() => {
    const sync = () => { setLookState(readLook()); setThemeState(read(THEME_KEY, 'system')) }
    const onStorage = (e) => { if (!e || e.key === null || e.key === LOOK_KEY || e.key === THEME_KEY) sync() }
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', onStorage)
    let mq = null
    const onMq = () => setDark(osDark())
    try {
      mq = window.matchMedia?.(DARK_QUERY) || null
      mq?.addEventListener?.('change', onMq)
    } catch { mq = null }
    setDark(osDark())
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', onStorage)
      try { mq?.removeEventListener?.('change', onMq) } catch { /* ignore */ }
    }
  }, [])

  // A "classic" preview override forces off; staff never get glass from storage on a production host.
  const active = override === 'classic' ? false : (!!allowed || override === 'glass') && look === 'glass'
  const resolvedTheme = resolveTheme(theme, dark)

  useEffect(() => {
    applyUi({ active, theme: resolvedTheme })
    return () => applyUi({ active: false, theme: resolvedTheme })
  }, [active, resolvedTheme])

  const canChoose = !!allowed || override !== null
  const themeKey = themes.join('|')

  const setLook = useCallback((v) => {
    if (!canChoose) return
    write(LOOK_KEY, v === 'glass' ? 'glass' : 'classic')
    setLookState(v === 'glass' ? 'glass' : 'classic')
    window.dispatchEvent(new Event(EVENT))
  }, [canChoose])

  const setTheme = useCallback((v) => {
    if (v !== 'system' && !themeKey.split('|').includes(v)) return
    write(THEME_KEY, v)
    setThemeState(v)
    window.dispatchEvent(new Event(EVENT))
  }, [themeKey])

  return { active, look, theme, resolvedTheme, setLook, setTheme, canChoose, themes }
}
