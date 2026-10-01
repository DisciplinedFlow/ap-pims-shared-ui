# ap-pims-shared-ui

Shared React components for the AP PIMS apps — DJR, Labor Planner, Lookahead, PM Portal.

Public repo on purpose: all four consuming repos are private and Netlify builds them
remotely (`command = "npm run build"`), so a private git dependency would fail to
install on the push-triggered deploy path. Nothing sensitive lives here — no keys,
no PII, no business logic. Only generic UI and the `change_requests` table name.

## Install

Pin a tag. Never track `#main` — an unpinned dependency makes every app's build
depend on whatever landed here most recently.

```bash
npm install github:tmstrrs-jpg/ap-pims-shared-ui#v0.1.0
```

`dist/` is committed, so installing runs no build step.

## `<GlobalCapture />`

Floating "Request a change" button, mounted once at the app root. Writes to
`public.change_requests`.

```jsx
import { GlobalCapture } from 'ap-pims-shared-ui'
import { supabase } from './supabaseClient'

<GlobalCapture supabase={supabase} module="djr" />
```

| Prop | Required | Default | Notes |
|---|---|---|---|
| `supabase` | yes | — | The host app's client. Passed in because this package is shared across four apps and can't import any one app's client module. |
| `module` | no | `"portal"` | Stored in `change_requests.module`. Use `portal` / `djr` / `labor` / `lookahead`. No CHECK constrains it. |
| `context` | no | derived from URL | Defaults to the screen from `?view=`, else the pathname. |
| `accent` | no | `#14202a` | Button and submit colour. |

Visible to **any signed-in user**. There is no client-side role gate: live
`user_profiles.role` values are `owner`, `pm`, `superintendent`, so the original
`["owner","pm","office"]` gate hid the button from all four superintendents — every
field user of DJR and Labor — while `office` matched nobody. Access control is RLS:
INSERT is `requested_by = auth.uid()`; SELECT returns your own rows, plus all rows
for `owner`/`pm`.

## Backend

`public.change_requests` — PK is a **legacy generic `id` (bigint)**, one of the few
PIMS tables where that's correct. `requested_by` defaults to `auth.uid()`; don't set
it explicitly. `kind` is CHECK-constrained to `data_fix` / `improvement` / `question`;
`status` to `open` / `in_review` / `approved` / `preview` / `applied` / `rejected`.

Triage (`RequestsPanel`, `shipViaDeploy`, the `ship-request` Netlify function) stays
local to PM Portal — those depend on portal-only endpoints. Only capture is shared.

## Release

```bash
npm run build
git add -A && git commit -m "..." && git push
git tag v0.1.1 && git push origin v0.1.1
```

Then bump the pinned tag in each consuming app's `package.json`.

## React

Peer dependency `^18.2.0 || ^19.0.0`. The apps span React 18.2 (Labor), 18.3
(Lookahead) and 19.2 (DJR, PM Portal); React is external in the build so no app
ends up with a second copy.

## Soft glass tokens + theme engine (v0.3)

An opt-in look. With the flag off nothing changes: every `--pims-*` variable exists only while `<html data-pims-ui="glass">` is set.

1. Import the CSS once, at the app entry:
   ```js
   import 'ap-pims-shared-ui/tokens.css'
   import 'ap-pims-shared-ui/base.css'
   ```
2. Mount the hook near the app root, with the gate from `fetchUiAllowed` (the `ui_glass` feature wins when present, otherwise only `role === 'owner'`):
   ```js
   import { usePimsUi, fetchUiAllowed } from 'ap-pims-shared-ui'
   const [allowed, setAllowed] = useState(false)
   useEffect(() => { fetchUiAllowed(supabase, role).then(setAllowed) }, [role])
   const ui = usePimsUi({ allowed, themes: ['system', 'light', 'dark'] }) // add 'field' in DJR, Labor, Lookahead
   ```
   On `localhost`, `127.0.0.1` and `deploy-preview-N--*` hosts, `?ui=glass` / `?ui=classic` forces the look. Production hosts ignore it.
3. Put the switcher inside an existing menu or panel (it has no positioning of its own, and renders nothing when `ui.canChoose` is false):
   ```jsx
   import { PimsLookMenu } from 'ap-pims-shared-ui'
   <PimsLookMenu ui={ui} />
   ```
4. Use `pv(name, classic)` for every themed style value. **The fallback must equal the replaced literal, character for character**; numbers become `px`:
   ```js
   import { pv } from 'ap-pims-shared-ui'
   style={{ background: pv('surface', '#fff'), borderRadius: pv('r-btn', 8) }}
   // → var(--pims-surface, #fff) / var(--pims-r-btn, 8px)
   ```
   An unknown token name throws, so typos fail tests.

Run `npm test` for the token scoping and WCAG contrast checks.

Default look: when `allowed` is true and the user has not chosen, the look is Soft glass; a stored choice (including Classic) wins. When `allowed` is false the look is always Classic. The `ui_glass` feature is the release and rollback switch.
