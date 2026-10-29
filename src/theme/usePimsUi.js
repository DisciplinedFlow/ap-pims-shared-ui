import { useCallback, useEffect, useState } from 'react'
import { LOOK_KEY, THEME_KEY, applyUi, previewOverride, resolveTheme } from './uiTheme.js'

const EVENT = 'pims:ui'
const DARK_QUERY = '(prefers-color-scheme: dark)'

// Choices storage refused to save (private mode, quota full). Read first, so this view still honours
// the choice it just made even when getItem works and would return the older stored value.
const mem = {}
function read(key, fallback) {
  if (key in mem) return mem[key] || fallback
  try { return globalThis.localStorage?.getItem(key) || fallback } catch { return fallback }
}
function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value)
    delete mem[key]
  } catch {
    mem[key] = value
  }
}
function osDark() {
  try { return !!globalThis.matchMedia?.(DARK_QUERY)?.matches } catch { return false }
}
// Mounted consumers and what each wants, in claim order (a Map keeps insertion order; re-claiming moves
// an entry to the end). Glass is on while any mounted consumer wants it, with the newest such claim's theme;
// a consumer still waiting for its gate (allowed undefined) cannot switch it off for the others. All
// consumers share storage and the pims:ui event, so a real choice (setLook classic) turns every one off.
const consumers = new Map()
function applyAll(fallbackTheme) {
  let on = null
  for (const s of consumers.values()) if (s.active) on = s
  applyUi(on || { active: false, theme: fallbackTheme })
}
function claim(owner, state) {
  consumers.delete(owner)
  consumers.set(owner, state)
  applyAll(state.theme)
}
function release(owner) {
  const theme = consumers.get(owner)?.theme
  consumers.delete(owner)
  applyAll(theme)
}

// null = nothing stored: the default then follows the gate (everyone allowed gets glass, otherwise classic).
const readLook = () => { const v = read(LOOK_KEY, null); return v === 'glass' || v === 'classic' ? v : null }

export function usePimsUi({ allowed, themes = ['system', 'light', 'dark'] } = {}) {
  // Captured once: a router rewriting the query string must not switch the preview look off mid-session.
  const [initialOverride] = useState(() => previewOverride())
  // An explicit setLook clears the override for the rest of this mount, so the menu works on preview URLs.
  const [cleared, setCleared] = useState(false)
  const override = cleared ? null : initialOverride
  const [stored, setLookState] = useState(readLook)
  // The preview override has precedence over storage (and the storage sync cannot knock it back).
  const look = override ?? stored ?? (allowed ? 'glass' : 'classic')
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
      if (mq?.addEventListener) mq.addEventListener('change', onMq)
      else mq?.addListener?.(onMq) // Safari < 14
    } catch { mq = null }
    setDark(osDark())
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', onStorage)
      try { if (mq?.removeEventListener) mq.removeEventListener('change', onMq); else mq?.removeListener?.(onMq) } catch { /* ignore */ }
    }
  }, [])

  // A "classic" preview override forces off; staff never get glass from storage on a production host.
  const active = override === 'classic' ? false : (!!allowed || initialOverride !== null) && look === 'glass'
  const resolvedTheme = resolveTheme(theme, dark)

  // Several consumers can be mounted at once (app shell + a settings panel). Each registers what it wants;
  // see claim/release above. Only the last consumer to unmount clears the page.
  const [owner] = useState(() => ({}))
  useEffect(() => {
    claim(owner, { active, theme: resolvedTheme })
    return () => release(owner)
  }, [owner, active, resolvedTheme])

  const canChoose = !!allowed || initialOverride !== null
  const themeKey = themes.join('|')

  const setLook = useCallback((v) => {
    if (!canChoose) return
    setCleared(true)
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
