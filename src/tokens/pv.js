import { PIMS_TOKENS } from './names.js'
const KNOWN = new Set(PIMS_TOKENS)
export function pv(name, classic) {
  if (!KNOWN.has(name)) throw new Error(`unknown pims token: ${name}`)
  const fb = typeof classic === 'number' ? `${classic}px` : String(classic)
  return `var(--pims-${name}, ${fb})`
}
