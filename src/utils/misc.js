// ─────────────────────────────────────────────
// utils/misc.js
// Small general-purpose helpers used across
// multiple parts of the app.
// ─────────────────────────────────────────────

/** Generate a short unique ID for cart items, transactions, etc. */
export const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Returns current Indian financial year string. e.g. "2024-25" */
export const getFinYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed; April = 3
  const startYear = m >= 3 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
};

/**
 * Returns true if the given ISO date string is within the last 24 hours.
 * Used to decide if an invoice is still editable.
 */
export const isWithin24Hours = (dateStr) =>
  Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
