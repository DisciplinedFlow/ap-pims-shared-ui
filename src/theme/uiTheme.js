// Soft glass look: gate, preview override, theme resolution, attribute writer.
// Mirrors glassAllowed in ap-pims-pm-portal/src/lib/uiTheme.js: when the database answers
// with a ui_glass key that answer decides; otherwise only the owner role is allowed.
export const UI_FEATURE = 'ui_glass'
export const UI_ATTR = 'data-pims-ui'
export const THEME_ATTR = 'data-pims-theme'
export const LOOK_KEY = 'pims.ui.look'
export const THEME_KEY = 'pims.ui.theme'

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

export function resolveAllowed({ role, features } = {}) {
  if (Array.isArray(features)) {
    if (features.includes(UI_FEATURE)) return true
    // Row shape ({ feature_key, enabled|allowed }), in case the RPC is ever changed to RETURNS TABLE.
    const row = features.find((f) => f && typeof f === 'object' && f.feature_key === UI_FEATURE)
    if (row) return (has(row, 'enabled') ? row.enabled : row.allowed) === true
  } else if (features && typeof features === 'object' && has(features, UI_FEATURE)) {
    return features[UI_FEATURE] === true
  }
  return role === 'owner'
}

// fn_my_features_v1 returns a plain object map { feature_key: boolean } (Portal loadMyFeatures): it is
// RETURNS jsonb over jsonb_object_agg (ap-pims-schema 20260929050000_feature_access.sql, its only definition),
// and '{}' when the registry is empty. resolveAllowed also accepts a key list or rows, for safety.
// On failure the owner-only default applies, logged so a broken check is visible rather than looking like "not allowed".
export async function fetchUiAllowed(supabase, role) {
  try {
    const { data, error } = await supabase.rpc('fn_my_features_v1')
    if (!error) return resolveAllowed({ role, features: data })
    console.error('[ap-pims-shared-ui] fn_my_features_v1 failed; using the owner-only default', { role, error })
  } catch (err) {
    console.error('[ap-pims-shared-ui] fn_my_features_v1 threw; using the owner-only default', { role, err })
  }
  return role === 'owner'
}

export function previewOverride(loc = globalThis.window?.location) {
  if (!loc) return null
  const host = loc.hostname
  if (!(host === 'localhost' || host === '127.0.0.1' || /^deploy-preview-\d+--/.test(host))) return null
  const v = new URLSearchParams(loc.search).get('ui')
  return v === 'glass' || v === 'classic' ? v : null
}

export function resolveTheme(pref, prefersDark) {
  if (pref === 'light' || pref === 'dark' || pref === 'field') return pref
  return prefersDark ? 'dark' : 'light'
}

const META_COLOR = { light: '#F3F5F9', dark: '#0A0D14', field: '#FFFFFF' }

function syncMeta(root, active, theme) {
  const meta = root.ownerDocument?.querySelector('meta[name="theme-color"]')
  if (!meta) return
  if (!meta.hasAttribute('data-classic')) meta.setAttribute('data-classic', meta.getAttribute('content') ?? '')
  meta.setAttribute('content', active ? (META_COLOR[theme] || META_COLOR.light) : meta.getAttribute('data-classic'))
}

export function applyUi({ active, theme }, root = globalThis.document?.documentElement) {
  if (!root) return
  if (active) {
    root.setAttribute(UI_ATTR, 'glass')
    root.setAttribute(THEME_ATTR, theme)
  } else {
    root.removeAttribute(UI_ATTR)
    root.removeAttribute(THEME_ATTR)
  }
  syncMeta(root, active, theme)
}
