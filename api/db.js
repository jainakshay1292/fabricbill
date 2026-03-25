// ─────────────────────────────────────────────────────────────
// /api/db.js  — Vercel Serverless Function
// Supabase key never leaves the server.
// All requests from the frontend go through here.
//
// Security fixes applied:
//   Fix 1 — Atomic invoice/voucher sequence via Supabase RPC
//   Fix 2 — HMAC-signed session token; all mutations verified
//   Fix 3 — Rate-limit state stored in Supabase (survives cold starts)
//   Fix 4 — Table name allowlist (no client-controlled injection)
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Fix 2: Set SESSION_SECRET in Vercel environment variables.
// Generate with: openssl rand -hex 32
const SESSION_SECRET = process.env.SESSION_SECRET;

// ── Rate limit config ──────────────────────────────────────
const MAX_PIN_ATTEMPTS  = 5;
const PIN_LOCKOUT_MS    = 30 * 1000;
const MAX_SHOP_ATTEMPTS = 10;
const SHOP_LOCKOUT_MS   = 5 * 60 * 1000;
const MAX_IP_REQUESTS   = 60;
const IP_WINDOW_MS      = 60 * 1000;

// Fix 4: Only these table names may be passed from the client
const ALLOWED_TABLES = new Set([
  "settings", "transactions", "customers", "products", "settlements",
  "employees", "attendance",
]);

// Read-only actions that work before a session token exists
const PUBLIC_ACTIONS = new Set(["login", "get", "getAll"]);

const headers = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Prefer":        "return=representation",
};

const sb = (path) => `${SUPABASE_URL}/rest/v1/${path}`;

// ── Fix 2: HMAC session token helpers ─────────────────────

async function hmacSign(payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacVerify(payload, sig) {
  const expected = await hmacSign(payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function issueToken(shopCode, role) {
  const expiry  = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${shopCode}|${role}|${expiry}`;
  const sig     = await hmacSign(payload);
  return Buffer.from(payload).toString("base64") + "." + sig;
}

async function verifyToken(token, expectedShopCode) {
  if (!token) throw new Error("Missing session token");
  const dot = token.lastIndexOf(".");
  if (dot < 0) throw new Error("Malformed token");
  const encoded = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const payload = Buffer.from(encoded, "base64").toString("utf8");
  if (!(await hmacVerify(payload, sig))) throw new Error("Invalid token signature");
  const [shopCode, role, expiryStr] = payload.split("|");
  if (shopCode !== expectedShopCode) throw new Error("Token shop mismatch");
  if (Date.now() > parseInt(expiryStr, 10)) throw new Error("Token expired");
  return { shopCode, role };
}

// ── Fix 3: Supabase-backed rate limiting ──────────────────
// Run once in Supabase SQL editor:
//
//   CREATE TABLE IF NOT EXISTS rate_limits (
//     id           text    PRIMARY KEY,
//     count        integer NOT NULL DEFAULT 0,
//     window_start bigint  NOT NULL DEFAULT 0,
//     last_attempt bigint  NOT NULL DEFAULT 0
//   );

async function getRateLimit(key) {
  const r    = await fetch(sb(`rate_limits?id=eq.${encodeURIComponent(key)}`), { headers });
  const rows = await r.json();
  return rows && rows.length > 0 ? rows[0] : null;
}

async function upsertRateLimit(key, fields) {
  await fetch(sb("rate_limits"), {
    method:  "POST",
    headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
    body:    JSON.stringify({ id: key, ...fields }),
  });
}

async function deleteRateLimit(key) {
  await fetch(sb(`rate_limits?id=eq.${encodeURIComponent(key)}`), { method: "DELETE", headers });
}

async function isIpRateLimited(ip) {
  const key  = `ip::${ip}`;
  const now  = Date.now();
  const row  = await getRateLimit(key);
  const windowExpired = !row || (now - row.window_start > IP_WINDOW_MS);
  const count         = windowExpired ? 1 : row.count + 1;
  const windowStart   = windowExpired ? now : row.window_start;
  await upsertRateLimit(key, { count, window_start: windowStart, last_attempt: now });
  return count > MAX_IP_REQUESTS;
}

async function isShopLockedOut(ip) {
  const row = await getRateLimit(`shop::${ip}`);
  if (!row || row.count < MAX_SHOP_ATTEMPTS) return false;
  if (Date.now() - row.last_attempt >= SHOP_LOCKOUT_MS) {
    await deleteRateLimit(`shop::${ip}`);
    return false;
  }
  return true;
}

async function recordShopAttempt(ip) {
  const key = `shop::${ip}`;
  const row = await getRateLimit(key);
  await upsertRateLimit(key, {
    count:        (row?.count || 0) + 1,
    window_start: row?.window_start || Date.now(),
    last_attempt: Date.now(),
  });
}

async function resetShopAttempts(ip) {
  await deleteRateLimit(`shop::${ip}`);
}

async function isPinLockedOut(shopCode) {
  const row = await getRateLimit(`pin::${shopCode}`);
  if (!row || row.count < MAX_PIN_ATTEMPTS) return null;
  if (Date.now() - row.last_attempt >= PIN_LOCKOUT_MS) {
    await deleteRateLimit(`pin::${shopCode}`);
    return null;
  }
  return row;
}

async function recordPinAttempt(shopCode) {
  const key = `pin::${shopCode}`;
  const row = await getRateLimit(key);
  await upsertRateLimit(key, {
    count:        (row?.count || 0) + 1,
    window_start: row?.window_start || Date.now(),
    last_attempt: Date.now(),
  });
}

async function resetPinAttempts(shopCode) {
  await deleteRateLimit(`pin::${shopCode}`);
}

// ── PIN hashing ────────────────────────────────────────────
async function hashPin(pin) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Login audit (location via server-side IP lookup) ───────
// Run once in Supabase SQL editor:
//
//   CREATE TABLE IF NOT EXISTS login_audit (
//     id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
//     timestamp    timestamptz NOT NULL DEFAULT now(),
//     shop_code    text        NOT NULL,
//     role         text,
//     result       text        NOT NULL,  -- 'success' | 'wrong_pin' | 'shop_not_found' | 'locked_out' | 'pin_not_configured'
//     ip           text,
//     city         text,
//     region       text,
//     country      text
//   );
//
async function writeLoginAudit(shopCode, role, result, ip) {
  // Geo-lookup using ip-api.com (free, no key, works from Vercel servers)
  let city = null, region = null, country = null;
  try {
    const geo = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (geo.ok) {
      const g = await geo.json();
      if (g.status === "success") {
        city    = g.city       || null;
        region  = g.regionName || null;
        country = g.country    || null;
      }
    }
  } catch {
    // Location is best-effort — never block login on geo failure
  }

  // Fire-and-forget — don't await so it never slows down the login response
  fetch(sb("login_audit"), {
    method:  "POST",
    headers: { ...headers, "Prefer": "return=minimal" },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      shop_code: shopCode,
      role:      role   || null,
      result,
      ip,
      city,
      region,
      country,
    }),
  }).catch(() => {}); // silent fail — audit must never break login
}

// ── Vercel handler ─────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // x-real-ip is set by Vercel and always reflects the true client IP
  const ip = (
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );

  if (await isIpRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const { action, shopCode, table, id, data, query, pin, role, token } = body;

  if (!shopCode) return res.status(400).json({ error: "shopCode required" });
  if (!/^[A-Z0-9]{4,20}$/.test(shopCode))
    return res.status(400).json({ error: "Invalid shop code format" });

  // Fix 2: verify token for every non-public action
  if (!PUBLIC_ACTIONS.has(action)) {
    try {
      await verifyToken(token, shopCode);
    } catch (e) {
      return res.status(401).json({ error: "Unauthorised: " + e.message });
    }
  }

  // Fix 4: validate table name for any action that uses it
  if (table !== undefined && !ALLOWED_TABLES.has(table)) {
    return res.status(400).json({ error: "Invalid table" });
  }

  try {

    // ── login ───────────────────────────────────────────────
    if (action === "login") {
      if (await isShopLockedOut(ip)) {
        const row       = await getRateLimit(`shop::${ip}`);
        const remaining = Math.ceil((SHOP_LOCKOUT_MS - (Date.now() - row.last_attempt)) / 1000);
        writeLoginAudit(shopCode, role, "locked_out", ip);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${remaining}s.` });
      }

      const pinLockRow = await isPinLockedOut(shopCode);
      if (pinLockRow) {
        const remaining = Math.ceil((PIN_LOCKOUT_MS - (Date.now() - pinLockRow.last_attempt)) / 1000);
        writeLoginAudit(shopCode, role, "locked_out", ip);
        return res.status(429).json({ error: `Too many attempts. Try again in ${remaining}s.` });
      }

      const r    = await fetch(sb(`settings?id=eq.${encodeURIComponent(shopCode + "::main")}`), { headers });
      const rows = await r.json();

      if (!rows || rows.length === 0) {
        await recordShopAttempt(ip);
        writeLoginAudit(shopCode, role, "shop_not_found", ip);
        return res.status(404).json({ error: "Shop not found" });
      }

      await resetShopAttempts(ip);

      const settings    = rows[0].data;
      const hashedPin   = await hashPin(pin);
      const correctHash = role === "admin" ? settings.adminPinHash : settings.staffPinHash;

      if (!correctHash) {
        writeLoginAudit(shopCode, role, "pin_not_configured", ip);
        return res.status(401).json({ error: "PIN not configured. Please set up your PIN in Settings." });
      }

      if (hashedPin !== correctHash) {
        await recordPinAttempt(shopCode);
        const pinRow    = await getRateLimit(`pin::${shopCode}`);
        const remaining = MAX_PIN_ATTEMPTS - (pinRow?.count || 1);
        writeLoginAudit(shopCode, role, "wrong_pin", ip);
        return res.status(401).json({
          error: `Wrong PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} left.`,
        });
      }

      await resetPinAttempts(shopCode);
      writeLoginAudit(shopCode, role, "success", ip);

      // Issue signed session token — client stores and sends on every mutation
      const sessionToken = await issueToken(shopCode, role);
      return res.status(200).json({ success: true, role, token: sessionToken });
    }

    // ── get single ──────────────────────────────────────────
    if (action === "get") {
      const fullId = `${shopCode}::${id}`;
      const r      = await fetch(sb(`${table}?id=eq.${encodeURIComponent(fullId)}`), { headers });
      const rows   = await r.json();
      return res.status(200).json(rows && rows.length > 0 ? rows[0].data : null);
    }

    // ── getAll ──────────────────────────────────────────────
    if (action === "getAll") {
      const order = table === "products" ? "created_at.asc" : "created_at.desc";
      const r     = await fetch(sb(`${table}?id=like.${encodeURIComponent(shopCode + "::")}*&order=${order}`), { headers });
      const rows  = await r.json();
      return res.status(200).json(Array.isArray(rows) ? rows.map((r) => r.data) : []);
    }

    // ── upsert ──────────────────────────────────────────────
    if (action === "upsert") {
      const fullId = `${shopCode}::${id}`;
      await fetch(sb(table), {
        method:  "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
        body:    JSON.stringify({ id: fullId, data }),
      });
      return res.status(200).json({ success: true });
    }

    // ── insert ──────────────────────────────────────────────
    if (action === "insert") {
      const fullId = `${shopCode}::${data.id}`;
      await fetch(sb(table), {
        method:  "POST",
        headers,
        body:    JSON.stringify({ id: fullId, data }),
      });
      return res.status(200).json({ success: true });
    }

    // ── delete ──────────────────────────────────────────────
    if (action === "delete") {
      const fullId = `${shopCode}::${id}`;
      await fetch(sb(`${table}?id=eq.${encodeURIComponent(fullId)}`), { method: "DELETE", headers });
      return res.status(200).json({ success: true });
    }

    // ── nextInvoice — Fix 1: atomic via RPC ─────────────────
    // Requires this function in Supabase SQL editor (run once):
    //
    //   CREATE OR REPLACE FUNCTION next_seq(seq_id text)
    //   RETURNS integer LANGUAGE plpgsql AS $$
    //   DECLARE n integer;
    //   BEGIN
    //     INSERT INTO invoice_seq(id, seq) VALUES (seq_id, 1)
    //     ON CONFLICT (id) DO UPDATE SET seq = invoice_seq.seq + 1
    //     RETURNING invoice_seq.seq INTO n;
    //     RETURN n;
    //   END;
    //   $$;
    //
    if (action === "nextInvoice") {
      const seqId   = `${shopCode}::${query}`;
      const r       = await fetch(`${SUPABASE_URL}/rest/v1/rpc/next_seq`, {
        method:  "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body:    JSON.stringify({ seq_id: seqId }),
      });
      const nextSeq = await r.json();
      if (!r.ok || typeof nextSeq !== "number") throw new Error("Failed to get next invoice sequence");
      return res.status(200).json({ invoiceNo: `${query}/${String(nextSeq).padStart(3, "0")}` });
    }

    // ── nextVoucher — Fix 1: atomic via RPC ─────────────────
    if (action === "nextVoucher") {
      const seqId   = `${shopCode}::RV::${query}`;
      const r       = await fetch(`${SUPABASE_URL}/rest/v1/rpc/next_seq`, {
        method:  "POST",
        headers: { ...headers, "Prefer": "return=representation" },
        body:    JSON.stringify({ seq_id: seqId }),
      });
      const nextSeq = await r.json();
      if (!r.ok || typeof nextSeq !== "number") throw new Error("Failed to get next voucher sequence");
      return res.status(200).json({ voucherNo: `RV-${query}/${String(nextSeq).padStart(3, "0")}` });
    }

    // ── validateEdit ────────────────────────────────────────
    if (action === "validateEdit") {
      const fullId = `${shopCode}::${id}`;
      const r      = await fetch(sb(`transactions?id=eq.${encodeURIComponent(fullId)}`), { headers });
      const rows   = await r.json();
      if (!rows || rows.length === 0) return res.status(404).json({ error: "Invoice not found" });
      const txn       = rows[0].data;
      const within24h = (Date.now() - new Date(txn.date).getTime()) < 24 * 60 * 60 * 1000;
      if (!within24h) return res.status(403).json({ error: "Invoice can only be edited within 24 hours of creation." });
      return res.status(200).json({ allowed: true });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err) {
    console.error("DB proxy error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
