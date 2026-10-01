import { PIMS_TOKENS } from './names.js'
const KNOWN = new Set(PIMS_TOKENS)
const warned = new Set()
// Dev = anything but production. process.env.NODE_ENV is left for the consuming app's bundler to
// replace (import.meta.env would be frozen at library build time). Read per call so tests can stub it.
const isDev = () => { try { return process.env.NODE_ENV !== 'production' } catch { return false } }
export function pv(name, classic) {
  if (!KNOWN.has(name)) {
    if (isDev()) throw new Error(`unknown pims token: ${name}`)
    if (!warned.has(name)) { warned.add(name); console.warn(`unknown pims token: ${name}`) }
  }
  const fb = typeof classic === 'number' ? `${classic}px` : String(classic)
  return `var(--pims-${name}, ${fb})`
}
