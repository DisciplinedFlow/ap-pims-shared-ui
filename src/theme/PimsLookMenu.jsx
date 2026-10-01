import { pv } from '../tokens/pv.js'

const LABELS = { classic: 'Classic', glass: 'Soft glass (new)', system: 'System', light: 'Light', dark: 'Dark', field: 'Field' }

// Tokens are not defined in classic, so the touch target is a literal, decided by the pointer type.
function coarsePointer() {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)')?.matches } catch { return false }
}

function Segmented({ label, value, options, onChange }) {
  const minHeight = coarsePointer() ? 44 : undefined
  return (
    <div role="group" aria-label={label} style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: pv('text-3', '#6b7280'), marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 2, padding: 2, background: pv('line', '#e5e7eb'), borderRadius: pv('r-btn', '8px') }}>
        {options.map((o) => {
          const on = value === o
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o)}
              style={{
                flex: 1, minHeight, border: 0, cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '5px 10px',
                borderRadius: pv('r-btn', '8px'),
                background: on ? pv('surface-solid', '#ffffff') : 'transparent',
                color: on ? pv('ink', '#111827') : pv('text-2', '#4b5563'),
                fontWeight: on ? 600 : 500,
                boxShadow: on ? pv('secondary-shadow', '0 1px 2px rgba(0,0,0,.12)') : 'none',
              }}
            >{LABELS[o] || o}</button>
          )
        })}
      </div>
    </div>
  )
}

// No positioning of its own: apps place it inside an existing menu or panel.
export function PimsLookMenu({ ui }) {
  if (!ui || !ui.canChoose) return null
  const themes = ui.themes || ['system', 'light', 'dark']
  return (
    <div style={{ minWidth: 220 }}>
      <Segmented label="Look" value={ui.look} options={['classic', 'glass']} onChange={ui.setLook} />
      {ui.look === 'glass' && <Segmented label="Theme" value={ui.theme} options={themes} onChange={ui.setTheme} />}
    </div>
  )
}
