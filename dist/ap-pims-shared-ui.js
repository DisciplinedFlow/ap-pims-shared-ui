import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
const F = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const ACCENT = "#14202a";
const REQUEST_KINDS = [
  ["data_fix", "Data fix"],
  ["improvement", "Improvement"],
  ["question", "Question"]
];
const SCREENSHOT_BUCKET = "change-request-screenshots";
const MAX_SCREENSHOTS = 5;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const DISPLAYABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const HEIC = /(^image\/hei[cf]$)|(\.hei[cf]$)/i;
function screenshotRejection(file) {
  if (HEIC.test(file.type) || HEIC.test(file.name)) {
    return `"${file.name}" is an iPhone HEIC photo, which no browser can display. Take a screenshot instead, or switch Settings → Camera → Formats → "Most Compatible".`;
  }
  if (!DISPLAYABLE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a JPEG, PNG or WebP image.`;
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return `"${file.name}" is ${(file.size / 1048576).toFixed(1)}MB — the limit is 10MB.`;
  }
  return null;
}
async function uploadScreenshots(supabase, files) {
  var _a;
  if (!(files == null ? void 0 : files.length)) return { paths: [], errors: [] };
  const { data: userData } = await supabase.auth.getUser();
  const uid = (_a = userData == null ? void 0 : userData.user) == null ? void 0 : _a.id;
  if (!uid) return { paths: [], errors: ["Not signed in — screenshots could not be uploaded."] };
  const paths = [], errors = [];
  const stamp = Date.now();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
    const { error } = await supabase.storage.from(SCREENSHOT_BUCKET).upload(`${uid}/${stamp}-${i}-${safe}`, file, { contentType: file.type, upsert: false });
    if (error) errors.push(`${file.name}: ${error.message}`);
    else paths.push(`${uid}/${stamp}-${i}-${safe}`);
  }
  return { paths, errors };
}
async function screenshotUrls(supabase, paths, expiresIn = 3600) {
  if (!(paths == null ? void 0 : paths.length)) return [];
  const { data, error } = await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) return [];
  return (data || []).filter((d) => d.signedUrl).map((d) => ({ path: d.path, url: d.signedUrl }));
}
async function loadRequests(supabase, module) {
  const { data, error } = await supabase.from("change_requests").select("*").eq("module", module).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
async function submitRequest(supabase, module, payload) {
  const { kind, title, details, context, observed_behavior, expected_behavior, screenshot_paths } = payload;
  const row = { module, kind, title, details, context: context || {} };
  if (observed_behavior) row.observed_behavior = observed_behavior;
  if (expected_behavior) row.expected_behavior = expected_behavior;
  if (screenshot_paths == null ? void 0 : screenshot_paths.length) row.screenshot_paths = screenshot_paths;
  const { error } = await supabase.from("change_requests").insert(row);
  if (error) {
    alert("Could not send request: " + error.message);
    return false;
  }
  return true;
}
const makeDescribe = (actions = []) => (a) => {
  if (!a || !a.type) return null;
  const def = actions.find((x) => x.type === a.type);
  return def ? def.describe(a) : null;
};
const PROMPTS = {
  data_fix: {
    observed: "What happened?",
    observedHint: "The wrong value, the error, what you saw on screen.",
    expected: "What should it have been?",
    expectedHint: "The correct value, or what you expected instead."
  },
  improvement: {
    observed: "What's hard about it today?",
    observedHint: "The slow or awkward part of how it works now.",
    expected: "What should it do instead?",
    expectedHint: "Describe the version that would save you time."
  }
};
function RequestModal({ supabase, context = {}, actions = [], onSubmit, onClose, accent = "#0e4c62" }) {
  var _a, _b;
  const [kind, setKind] = useState("data_fix");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [observed, setObserved] = useState("");
  const [expected, setExpected] = useState("");
  const [shots, setShots] = useState([]);
  const [shotErrors, setShotErrors] = useState([]);
  const [action, setAction] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const ctxBits = [context.asset_label, context.txn_date, context.card_number ? "card •••" + String(context.card_number).slice(-3) : null, context.label].filter(Boolean);
  const applicable = actions.filter((a) => a.scope === "transaction" ? context.transaction_id != null : a.scope === "card" ? context.card_number != null : true);
  const canStructure = kind === "data_fix" && applicable.length > 0;
  const selDef = applicable.find((a) => a.type === action);
  const guided = PROMPTS[kind];
  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const errs = [], keep = [];
    for (const f of incoming) {
      const why = screenshotRejection(f);
      if (why) errs.push(why);
      else keep.push(f);
    }
    const room = MAX_SCREENSHOTS - shots.length;
    if (keep.length > room) errs.push(`Only ${MAX_SCREENSHOTS} images per request — ${keep.length - room} not attached.`);
    setShots([...shots, ...keep.slice(0, Math.max(0, room))]);
    setShotErrors(errs);
  };
  const removeShot = (i) => {
    setShots(shots.filter((_, n) => n !== i));
    setShotErrors([]);
  };
  const submit = async () => {
    if (!title.trim()) {
      alert("Give the request a short title.");
      return;
    }
    if (guided && !observed.trim()) {
      alert(guided.observed);
      return;
    }
    if (guided && !expected.trim()) {
      alert(guided.expected);
      return;
    }
    if ((selDef == null ? void 0 : selDef.input) && !String(actionValue).trim()) {
      alert("Enter " + (selDef.input.placeholder || "a value") + ".");
      return;
    }
    const ctx = { ...context };
    if (canStructure && selDef) {
      ctx.action = { type: selDef.type };
      if (selDef.input) ctx.action.value = selDef.cast ? selDef.cast(actionValue) : actionValue;
    }
    setSaving(true);
    let paths = [];
    if (shots.length && supabase) {
      setProgress(`Uploading ${shots.length} image${shots.length > 1 ? "s" : ""}…`);
      const res = await uploadScreenshots(supabase, shots);
      paths = res.paths;
      if (res.errors.length) setShotErrors(res.errors);
    }
    setProgress("Sending…");
    const ok = await onSubmit({
      kind,
      title: title.trim(),
      details: details.trim() || null,
      observed_behavior: guided ? observed.trim() : null,
      expected_behavior: guided ? expected.trim() : null,
      screenshot_paths: paths,
      context: ctx
    });
    setSaving(false);
    setProgress("");
    if (ok) onClose();
  };
  const field = { width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: F, border: "1px solid #e0e0d8", borderRadius: 8, boxSizing: "border-box" };
  const label = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" };
  const hint = { fontSize: 11, color: "#94a3b8", margin: "3px 0 0" };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { onClick: onClose, style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1100 } }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: "min(480px, 92vw)",
      maxHeight: "90vh",
      overflowY: "auto",
      background: "#fff",
      borderRadius: 14,
      boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
      zIndex: 1110,
      padding: 20,
      fontFamily: F,
      WebkitOverflowScrolling: "touch"
    }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 4 }, children: "Request a change" }),
      ctxBits.length > 0 && /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "#64748b", marginBottom: 12 }, children: [
        "Re: ",
        ctxBits.join(" · ")
      ] }),
      /* @__PURE__ */ jsx("label", { style: label, children: "Type" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, margin: "6px 0 12px" }, children: REQUEST_KINDS.map(([v, lbl]) => /* @__PURE__ */ jsx("button", { onClick: () => {
        setKind(v);
        setAction("");
        setActionValue("");
      }, style: { flex: 1, padding: "7px 8px", fontSize: 12, fontWeight: 600, fontFamily: F, cursor: "pointer", borderRadius: 8, border: `1px solid ${kind === v ? "#14202a" : "#e0e0d8"}`, background: kind === v ? "#14202a" : "#fff", color: kind === v ? "#fff" : "#64748b" }, children: lbl }, v)) }),
      /* @__PURE__ */ jsx("label", { style: label, children: "Title" }),
      /* @__PURE__ */ jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), placeholder: kind === "improvement" ? "e.g. Add a weekly summary email" : "e.g. This value looks wrong", style: { ...field, margin: "6px 0 12px" } }),
      canStructure && /* @__PURE__ */ jsxs("div", { style: { margin: "0 0 12px", padding: "10px 12px", background: "#f8fafc", border: "1px solid #e7eff2", borderRadius: 8 }, children: [
        /* @__PURE__ */ jsx("label", { style: { ...label, color: "#0e4c62" }, children: "Proposed fix (one-click for the owner)" }),
        /* @__PURE__ */ jsxs("select", { value: action, onChange: (e) => {
          setAction(e.target.value);
          setActionValue("");
        }, style: { ...field, margin: "6px 0 0" }, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Just describe it below" }),
          applicable.map((a) => /* @__PURE__ */ jsx("option", { value: a.type, children: a.label }, a.type))
        ] }),
        ((_a = selDef == null ? void 0 : selDef.input) == null ? void 0 : _a.kind) === "number" && /* @__PURE__ */ jsx("input", { type: "number", min: "0", step: "1", value: actionValue, onChange: (e) => setActionValue(e.target.value), placeholder: selDef.input.placeholder || "", style: { ...field, margin: "8px 0 0" } }),
        ((_b = selDef == null ? void 0 : selDef.input) == null ? void 0 : _b.kind) === "select" && /* @__PURE__ */ jsxs("select", { value: actionValue, onChange: (e) => setActionValue(e.target.value), style: { ...field, margin: "8px 0 0" }, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: selDef.input.placeholder || "Pick one…" }),
          (selDef.input.options || []).map(([v, lbl]) => /* @__PURE__ */ jsx("option", { value: v, children: lbl }, v))
        ] })
      ] }),
      guided ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { style: label, children: guided.observed }),
        /* @__PURE__ */ jsx("textarea", { value: observed, onChange: (e) => setObserved(e.target.value), rows: 2, placeholder: guided.observedHint, style: { ...field, margin: "6px 0 0", resize: "vertical" } }),
        /* @__PURE__ */ jsx("label", { style: { ...label, display: "block", marginTop: 12 }, children: guided.expected }),
        /* @__PURE__ */ jsx("textarea", { value: expected, onChange: (e) => setExpected(e.target.value), rows: 2, placeholder: guided.expectedHint, style: { ...field, margin: "6px 0 0", resize: "vertical" } }),
        /* @__PURE__ */ jsx("label", { style: { ...label, display: "block", marginTop: 12 }, children: "Anything else? (optional)" }),
        /* @__PURE__ */ jsx("textarea", { value: details, onChange: (e) => setDetails(e.target.value), rows: 2, placeholder: "What you were doing when it happened, or anything else that helps.", style: { ...field, margin: "6px 0 0", resize: "vertical" } })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("label", { style: label, children: "Your question" }),
        /* @__PURE__ */ jsx("textarea", { value: details, onChange: (e) => setDetails(e.target.value), rows: 4, placeholder: "Ask it in your own words.", style: { ...field, margin: "6px 0 0", resize: "vertical" } })
      ] }),
      supabase && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("label", { style: { ...label, display: "block", marginTop: 14 }, children: [
          "Screenshots (optional, up to ",
          MAX_SCREENSHOTS,
          ")"
        ] }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "file",
            accept: "image/jpeg,image/png,image/webp",
            multiple: true,
            onChange: (e) => {
              addFiles(e.target.files);
              e.target.value = "";
            },
            disabled: shots.length >= MAX_SCREENSHOTS,
            style: { ...field, margin: "6px 0 0", padding: "7px 8px", fontSize: 12, background: "#fff" }
          }
        ),
        /* @__PURE__ */ jsx("div", { style: hint, children: "On a phone this opens the camera roll." }),
        shots.length > 0 && /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 0" }, children: shots.map((f, i) => /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid #e0e0d8" }, children: [
          /* @__PURE__ */ jsx("img", { src: URL.createObjectURL(f), alt: f.name, style: { width: "100%", height: "100%", objectFit: "cover" } }),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => removeShot(i),
              title: "Remove " + f.name,
              style: { position: "absolute", top: 2, right: 2, width: 18, height: 18, lineHeight: "16px", textAlign: "center", padding: 0, fontSize: 12, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 9, cursor: "pointer" },
              children: "×"
            }
          )
        ] }, i)) }),
        shotErrors.length > 0 && /* @__PURE__ */ jsx("div", { style: { margin: "8px 0 0", padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }, children: shotErrors.map((e, i) => /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "#b91c1c", lineHeight: 1.4 }, children: e }, i)) })
      ] }),
      context.screen && /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "#94a3b8", margin: "12px 0 0" }, children: [
        "Filed from ",
        /* @__PURE__ */ jsx("strong", { style: { color: "#64748b" }, children: context.screen }),
        " — captured automatically."
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16 }, children: [
        progress && /* @__PURE__ */ jsx("span", { style: { fontSize: 11, color: "#64748b", marginRight: "auto" }, children: progress }),
        /* @__PURE__ */ jsx("button", { onClick: onClose, style: { fontSize: 13, fontWeight: 600, color: "#64748b", background: "transparent", border: "1px solid #e0e0d8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: F }, children: "Cancel" }),
        /* @__PURE__ */ jsx("button", { onClick: submit, disabled: saving, style: { fontSize: 13, fontWeight: 700, color: "#fff", background: accent, border: "none", borderRadius: 8, padding: "8px 18px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: F }, children: saving ? "Sending…" : "Send request" })
      ] })
    ] })
  ] });
}
function currentScreen() {
  try {
    const url = new URL(window.location);
    const view = url.searchParams.get("view") || url.searchParams.get("screen");
    if (view) return view;
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    return path || "home";
  } catch {
    return "home";
  }
}
function GlobalCapture({ supabase, module = "portal", context, accent = ACCENT }) {
  const [signedIn, setSignedIn] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let on = true;
    supabase.auth.getUser().then(({ data }) => {
      if (on) setSignedIn(!!(data == null ? void 0 : data.user));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (on) setSignedIn(!!(session == null ? void 0 : session.user));
    });
    return () => {
      var _a;
      on = false;
      (_a = sub == null ? void 0 : sub.subscription) == null ? void 0 : _a.unsubscribe();
    };
  }, [supabase]);
  if (!supabase || !signedIn) return null;
  const screen = currentScreen();
  const ctx = context || { screen, label: "Screen: " + screen };
  const submit = async (payload) => {
    const ok = await submitRequest(supabase, module, payload);
    if (ok) window.dispatchEvent(new CustomEvent("pims-request-filed"));
    return ok;
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    !openModal && /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setOpenModal(true),
        title: "Request a change on this screen",
        style: {
          // Bottom-LEFT (not right): the bottom-right corner is where every screen's primary
          // actions live — Payables Approve/Office/Owner/Send-back are inline at the bottom of the
          // invoice pane, plus modal confirm buttons — and this fixed z-2500 button was covering
          // them (req #12). The app shell has no left rail, so the bottom-left corner is clear.
          position: "fixed",
          left: 18,
          bottom: 18,
          zIndex: 2500,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: F,
          color: "#fff",
          background: accent,
          border: "none",
          borderRadius: 24,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          cursor: "pointer"
        },
        children: [
          /* @__PURE__ */ jsx("span", { style: { fontSize: 15 }, children: "✎" }),
          " Request a change"
        ]
      }
    ),
    openModal && /* @__PURE__ */ jsx(
      RequestModal,
      {
        supabase,
        context: ctx,
        actions: [],
        accent,
        onSubmit: submit,
        onClose: () => setOpenModal(false)
      }
    )
  ] });
}
const PIMS_TOKENS = Object.freeze([
  "font",
  "bg-base",
  "bg-image",
  "bar",
  "side",
  "surface",
  "surface-solid",
  "field",
  "sel",
  "hover",
  "ink",
  "text-2",
  "text-3",
  "line",
  "line-2",
  "field-border",
  "card-border",
  "accent",
  "accent-ink",
  "primary-from",
  "primary-to",
  "primary",
  "on-primary",
  "primary-shadow",
  "secondary-shadow",
  "card-shadow",
  "chip-on",
  "chip-on-ink",
  "info",
  "info-soft",
  "warn",
  "warn-soft",
  "danger",
  "danger-soft",
  "ok",
  "ok-soft",
  "r-btn",
  "r-chip",
  "r-field",
  "r-card",
  "r-row",
  "h-btn",
  "h-field",
  "pad-btn",
  "blur",
  "focus-ring",
  "press-scale",
  "dur"
]);
const KNOWN = new Set(PIMS_TOKENS);
const warned = /* @__PURE__ */ new Set();
const isDev = () => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
};
function pv(name, classic) {
  if (!KNOWN.has(name)) {
    if (isDev()) throw new Error(`unknown pims token: ${name}`);
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`unknown pims token: ${name}`);
    }
  }
  const fb = typeof classic === "number" ? `${classic}px` : String(classic);
  return `var(--pims-${name}, ${fb})`;
}
const UI_FEATURE = "ui_glass";
const UI_ATTR = "data-pims-ui";
const THEME_ATTR = "data-pims-theme";
const LOOK_KEY = "pims.ui.look";
const THEME_KEY = "pims.ui.theme";
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function resolveAllowed({ role, features } = {}) {
  if (Array.isArray(features)) {
    if (features.includes(UI_FEATURE)) return true;
    const row = features.find((f) => f && typeof f === "object" && f.feature_key === UI_FEATURE);
    if (row) return (has(row, "enabled") ? row.enabled : row.allowed) === true;
  } else if (features && typeof features === "object" && has(features, UI_FEATURE)) {
    return features[UI_FEATURE] === true;
  }
  return role === "owner";
}
async function fetchUiAllowed(supabase, role) {
  try {
    const { data, error } = await supabase.rpc("fn_my_features_v1");
    if (!error) return resolveAllowed({ role, features: data });
    console.error("[ap-pims-shared-ui] fn_my_features_v1 failed; using the owner-only default", { role, error });
  } catch (err) {
    console.error("[ap-pims-shared-ui] fn_my_features_v1 threw; using the owner-only default", { role, err });
  }
  return role === "owner";
}
function previewOverride(loc = ((_a) => (_a = globalThis.window) == null ? void 0 : _a.location)()) {
  if (!loc) return null;
  const host = loc.hostname;
  if (!(host === "localhost" || host === "127.0.0.1" || /^deploy-preview-\d+--/.test(host))) return null;
  const v = new URLSearchParams(loc.search).get("ui");
  return v === "glass" || v === "classic" ? v : null;
}
function resolveTheme(pref, prefersDark) {
  if (pref === "light" || pref === "dark" || pref === "field") return pref;
  return prefersDark ? "dark" : "light";
}
const META_COLOR = { light: "#F3F5F9", dark: "#0A0D14", field: "#FFFFFF" };
function syncMeta(root, active, theme) {
  var _a;
  const meta = (_a = root.ownerDocument) == null ? void 0 : _a.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  if (!meta.hasAttribute("data-classic")) meta.setAttribute("data-classic", meta.getAttribute("content") ?? "");
  meta.setAttribute("content", active ? META_COLOR[theme] || META_COLOR.light : meta.getAttribute("data-classic"));
}
function applyUi({ active, theme }, root = ((_b) => (_b = globalThis.document) == null ? void 0 : _b.documentElement)()) {
  if (!root) return;
  if (active) {
    root.setAttribute(UI_ATTR, "glass");
    root.setAttribute(THEME_ATTR, theme);
  } else {
    root.removeAttribute(UI_ATTR);
    root.removeAttribute(THEME_ATTR);
  }
  syncMeta(root, active, theme);
}
const EVENT = "pims:ui";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const mem = {};
function read(key, fallback) {
  var _a;
  if (key in mem) return mem[key] || fallback;
  try {
    return ((_a = globalThis.localStorage) == null ? void 0 : _a.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  var _a;
  try {
    (_a = globalThis.localStorage) == null ? void 0 : _a.setItem(key, value);
    delete mem[key];
  } catch {
    mem[key] = value;
  }
}
function osDark() {
  var _a, _b;
  try {
    return !!((_b = (_a = globalThis.matchMedia) == null ? void 0 : _a.call(globalThis, DARK_QUERY)) == null ? void 0 : _b.matches);
  } catch {
    return false;
  }
}
const consumers = /* @__PURE__ */ new Map();
function applyAll(fallbackTheme) {
  let on = null;
  for (const s of consumers.values()) if (s.active) on = s;
  applyUi(on || { active: false, theme: fallbackTheme });
}
function claim(owner, state) {
  consumers.delete(owner);
  consumers.set(owner, state);
  applyAll(state.theme);
}
function release(owner) {
  var _a;
  const theme = (_a = consumers.get(owner)) == null ? void 0 : _a.theme;
  consumers.delete(owner);
  applyAll(theme);
}
const readLook = () => {
  const v = read(LOOK_KEY, null);
  return v === "glass" || v === "classic" ? v : null;
};
function usePimsUi({ allowed, themes = ["system", "light", "dark"] } = {}) {
  const [initialOverride] = useState(() => previewOverride());
  const [cleared, setCleared] = useState(false);
  const override = cleared ? null : initialOverride;
  const [stored, setLookState] = useState(readLook);
  const look = override ?? stored ?? (allowed ? "glass" : "classic");
  const [theme, setThemeState] = useState(() => read(THEME_KEY, "system"));
  const [dark, setDark] = useState(osDark);
  useEffect(() => {
    var _a, _b;
    const sync = () => {
      setLookState(readLook());
      setThemeState(read(THEME_KEY, "system"));
    };
    const onStorage = (e) => {
      if (!e || e.key === null || e.key === LOOK_KEY || e.key === THEME_KEY) sync();
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    let mq = null;
    const onMq = () => setDark(osDark());
    try {
      mq = ((_a = window.matchMedia) == null ? void 0 : _a.call(window, DARK_QUERY)) || null;
      if (mq == null ? void 0 : mq.addEventListener) mq.addEventListener("change", onMq);
      else (_b = mq == null ? void 0 : mq.addListener) == null ? void 0 : _b.call(mq, onMq);
    } catch {
      mq = null;
    }
    setDark(osDark());
    return () => {
      var _a2;
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
      try {
        if (mq == null ? void 0 : mq.removeEventListener) mq.removeEventListener("change", onMq);
        else (_a2 = mq == null ? void 0 : mq.removeListener) == null ? void 0 : _a2.call(mq, onMq);
      } catch {
      }
    };
  }, []);
  const active = override === "classic" ? false : (!!allowed || initialOverride !== null) && look === "glass";
  const resolvedTheme = resolveTheme(theme, dark);
  const [owner] = useState(() => ({}));
  useEffect(() => {
    claim(owner, { active, theme: resolvedTheme });
    return () => release(owner);
  }, [owner, active, resolvedTheme]);
  const canChoose = !!allowed || initialOverride !== null;
  const themeKey = themes.join("|");
  const setLook = useCallback((v) => {
    if (!canChoose) return;
    setCleared(true);
    write(LOOK_KEY, v === "glass" ? "glass" : "classic");
    setLookState(v === "glass" ? "glass" : "classic");
    window.dispatchEvent(new Event(EVENT));
  }, [canChoose]);
  const setTheme = useCallback((v) => {
    if (v !== "system" && !themeKey.split("|").includes(v)) return;
    write(THEME_KEY, v);
    setThemeState(v);
    window.dispatchEvent(new Event(EVENT));
  }, [themeKey]);
  return { active, look, theme, resolvedTheme, setLook, setTheme, canChoose, themes };
}
const LABELS = { classic: "Classic", glass: "Soft glass (new)", system: "System", light: "Light", dark: "Dark", field: "Field" };
function coarsePointer() {
  var _a, _b;
  try {
    return !!((_b = (_a = globalThis.matchMedia) == null ? void 0 : _a.call(globalThis, "(pointer: coarse)")) == null ? void 0 : _b.matches);
  } catch {
    return false;
  }
}
function Segmented({ label, value, options, onChange }) {
  const minHeight = coarsePointer() ? 44 : void 0;
  return /* @__PURE__ */ jsxs("div", { role: "group", "aria-label": label, style: { marginBottom: 8 }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: pv("text-3", "#6b7280"), marginBottom: 4 }, children: label }),
    /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 2, padding: 2, background: pv("line", "#e5e7eb"), borderRadius: pv("r-btn", "8px") }, children: options.map((o) => {
      const on = value === o;
      return /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          "aria-pressed": on,
          onClick: () => onChange(o),
          style: {
            flex: 1,
            minHeight,
            border: 0,
            cursor: "pointer",
            font: "inherit",
            fontSize: 12,
            padding: "5px 10px",
            borderRadius: pv("r-btn", "8px"),
            background: on ? pv("surface-solid", "#ffffff") : "transparent",
            color: on ? pv("ink", "#111827") : pv("text-2", "#4b5563"),
            fontWeight: on ? 600 : 500,
            boxShadow: on ? pv("secondary-shadow", "0 1px 2px rgba(0,0,0,.12)") : "none"
          },
          children: LABELS[o] || o
        },
        o
      );
    }) })
  ] });
}
function PimsLookMenu({ ui }) {
  if (!ui || !ui.canChoose) return null;
  const themes = ui.themes || ["system", "light", "dark"];
  return /* @__PURE__ */ jsxs("div", { style: { minWidth: 220 }, children: [
    /* @__PURE__ */ jsx(Segmented, { label: "Look", value: ui.look, options: ["classic", "glass"], onChange: ui.setLook }),
    ui.look === "glass" && /* @__PURE__ */ jsx(Segmented, { label: "Theme", value: ui.theme, options: themes, onChange: ui.setTheme })
  ] });
}
export {
  ACCENT,
  F,
  GlobalCapture,
  LOOK_KEY,
  MAX_SCREENSHOTS,
  MAX_SCREENSHOT_BYTES,
  PIMS_TOKENS,
  PimsLookMenu,
  REQUEST_KINDS,
  RequestModal,
  SCREENSHOT_BUCKET,
  THEME_ATTR,
  THEME_KEY,
  UI_ATTR,
  UI_FEATURE,
  applyUi,
  fetchUiAllowed,
  loadRequests,
  makeDescribe,
  previewOverride,
  pv,
  resolveAllowed,
  resolveTheme,
  screenshotRejection,
  screenshotUrls,
  submitRequest,
  uploadScreenshots,
  usePimsUi
};
