// ─────────────────────────────────────────────
// styles/index.js
// Shared inline style objects used across all
// components. Import what you need.
//
// Why inline styles? This app uses them for
// portability — no CSS build step needed.
// ─────────────────────────────────────────────

/** Card container — white rounded box with subtle shadow */
export const card = {
  background: "#fff",
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
};

/** Standard full-width text input */
export const inp = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};

/** Form field label */
export const lbl = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 4,
};

/** Border used inside invoice print layout */
export const BDR = "1px solid #000";

/**
 * Invoice table cell style — merges with any extra styles passed in.
 * @param {Object} extra - additional style overrides
 */
export const tds = (extra = {}) => ({
  ...extra,
  border: BDR,
  padding: "4px 6px",
  fontSize: 11,
});

/**
 * Inject global CSS once into the document <head>.
 * Call this once at app startup (in App.js or index.js).
 * Handles: font import, box-sizing reset, spinner hiding, focus ring, hover animations.
 */
export function injectGlobalStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("fb-style")) return; // already injected

  const s = document.createElement("style");
  s.id = "fb-style";
  s.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'DM Sans', -apple-system, sans-serif; background: #f0f2f5; }
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    input[type=number] { -moz-appearance: textfield; }
    button { transition: opacity 0.15s, transform 0.1s; }
    button:active { transform: scale(0.97); opacity: 0.9; }
    input:focus, select:focus { outline: none; border-color: #1e3a5f !important; }
    .day-row { transition: background 0.15s; border-radius: 8px; cursor: pointer; }
    .day-row:hover { background: #f0f2f5; }
  `;
  document.head.appendChild(s);
}
