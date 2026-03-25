// ─────────────────────────────────────────────────────────────
// src/lib/api.js
// All DB calls go through /api proxy — Supabase key never
// exposed in the browser.
//
// Session token is stored in memory (set after login via
// setSessionToken) and attached to every mutating request.
// ─────────────────────────────────────────────────────────────

// ── Session token (in-memory, not localStorage) ───────────
// Set by App.js after a successful login. Cleared on logout.
let _sessionToken = null;

export function setSessionToken(token) {
  _sessionToken = token;
}

export function clearSessionToken() {
  _sessionToken = null;
}

// ── Core fetch wrapper ────────────────────────────────────
const call = async (body) => {
  // Attach session token to every request that needs it.
  // The server ignores it for public actions (login, get, getAll).
  const payload = _sessionToken
    ? { ...body, token: _sessionToken }
    : body;

  const r = await fetch("/api/db", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
};

// ── Auth ──────────────────────────────────────────────────────
export const loginWithPin = (shopCode, role, pin) =>
  call({ action: "login", shopCode, role, pin });

// ── Settings ──────────────────────────────────────────────────
export const getSettings = (shopCode) =>
  call({ action: "get", shopCode, table: "settings", id: "main" });

export const saveSettings = (shopCode, data) =>
  call({ action: "upsert", shopCode, table: "settings", id: "main", data });

// ── Transactions ──────────────────────────────────────────────
export const getTransactions = (shopCode) =>
  call({ action: "getAll", shopCode, table: "transactions" });

export const insertTransaction = (shopCode, txn) =>
  call({ action: "insert", shopCode, table: "transactions", data: txn });

export const updateTransaction = (shopCode, txn) =>
  call({ action: "upsert", shopCode, table: "transactions", id: txn.id, data: txn });

export const validateInvoiceEdit = (shopCode, invoiceId) =>
  call({ action: "validateEdit", shopCode, id: invoiceId });

// ── Customers ─────────────────────────────────────────────────
export const getCustomers = (shopCode) =>
  call({ action: "getAll", shopCode, table: "customers" });

export const upsertCustomer = (shopCode, customer) =>
  call({ action: "upsert", shopCode, table: "customers", id: customer.id, data: customer });

// ── Products ──────────────────────────────────────────────────
export const getProducts = (shopCode) =>
  call({ action: "getAll", shopCode, table: "products" });

export const insertProduct = (shopCode, prod) =>
  call({ action: "insert", shopCode, table: "products", data: prod });

export const updateProduct = (shopCode, prod) =>
  call({ action: "upsert", shopCode, table: "products", id: prod.id, data: prod });

export const deleteProduct = (shopCode, id) =>
  call({ action: "delete", shopCode, table: "products", id });

// ── Invoice sequence ──────────────────────────────────────────
export const getNextInvoiceNo = async (shopCode) => {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const s = m >= 3 ? y : y - 1;
  const fy = `${s}-${String(s + 1).slice(2)}`;
  const { invoiceNo } = await call({ action: "nextInvoice", shopCode, query: fy });
  return invoiceNo;
};

// ── Settlements ───────────────────────────────────────────────
export const getSettlements = (shopCode) =>
  call({ action: "getAll", shopCode, table: "settlements" });

export const insertSettlement = (shopCode, settlement) =>
  call({ action: "insert", shopCode, table: "settlements", data: settlement });

export const getNextVoucherNo = async (shopCode) => {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const s = m >= 3 ? y : y - 1;
  const fy = `${s}-${String(s + 1).slice(2)}`;
  const { voucherNo } = await call({ action: "nextVoucher", shopCode, query: fy });
  return voucherNo;
};

// ── Shop registration ─────────────────────────────────────────
export const registerShop = async (shopCode, settings) => {
  await saveSettings(shopCode, settings);
  await upsertCustomer(shopCode, { id: "c1", name: "Walk-in Customer", phone: "" });
};

// ── PIN hashing (client-side, for registration only) ──────────
export const hashPin = async (pin) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

// ── PDF upload ────────────────────────────────────────────────
export async function uploadPDF(base64, filename) {
  const res = await fetch("/api/uploadPDF", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ base64, filename }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "PDF upload failed");
  }
  const data = await res.json();
  return data.url;
}

// ── WhatsApp ──────────────────────────────────────────────────
export async function sendWhatsApp(phone, templateName, variables, mediaUrl = "", mediaFilename = "") {
  if (!phone || phone.length !== 10) {
    throw new Error("Invalid phone number — must be 10 digits");
  }
  const res = await fetch("/api/sendWhatsApp", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ phone, templateName, variables, mediaUrl, mediaFilename }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "WhatsApp send failed");
  }
  return res.json();
}
