// Shared UI for the AP PIMS apps (DJR, Labor, Lookahead, PM Portal).
//
//   import { GlobalCapture } from 'ap-pims-shared-ui';
//   <GlobalCapture supabase={supabase} module="djr" />
//
// The change_requests backend (table, RLS, triage routine, ship-to-deploy
// endpoint) is shared and needs no per-app work. PM Portal keeps its own
// RequestsPanel/triage surface locally — only the capture side is shared.

export { default as GlobalCapture } from "./GlobalCapture";
export { default as RequestModal } from "./RequestModal";
export {
  loadRequests, submitRequest, makeDescribe, REQUEST_KINDS,
  // Screenshot intake. screenshotUrls is what a triage surface needs: the bucket
  // is private, so a stored path is not viewable without a signed URL.
  uploadScreenshots, screenshotUrls, screenshotRejection,
  SCREENSHOT_BUCKET, MAX_SCREENSHOTS, MAX_SCREENSHOT_BYTES,
} from "./requestsApi";
export { F, ACCENT } from "./theme";

// Soft glass tokens + theme engine (v0.3). CSS: 'ap-pims-shared-ui/tokens.css', 'ap-pims-shared-ui/base.css'.
export { pv } from "./tokens/pv.js";
export { PIMS_TOKENS } from "./tokens/names.js";
export * from "./theme/uiTheme.js";
export { usePimsUi } from "./theme/usePimsUi.js";
export { PimsLookMenu } from "./theme/PimsLookMenu.jsx";
