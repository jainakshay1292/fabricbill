// ─────────────────────────────────────────────────────────────
// /api/db.js  — Vercel Serverless Function
// Supabase key never leaves the server.
// All requests from the frontend go through here.
//
// Security fixes applied:
//   Fix 2 — No plain text PIN fallback (hash only)
//   Fix 3 — Shop code brute force protection
//   Fix 4 — Global rate limiting per IP
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Rate limit config ──────────────────────────────────────
const MAX_PIN_ATTEMPTS   = 5;
const PIN_LOCKOUT_MS     = 30 * 1000;        // 30s PIN lockout
const MAX_SHOP_ATTEMPTS  = 10;               // Fix 3: shop code brute force
const SHOP_LOCKOUT_MS    = 5 * 60 * 1000;   // 5 min shop lockout
const MAX_IP_REQUESTS    = 60;              // Fix 4: max requests per IP
const IP_WINDOW_MS       = 60 * 1000;       // per 1 minute window

const pinAttempts  = {};   // PIN brute force tracker
const shopAttempts = {};   // Fix 3: shop code brute force tracker
const ipRequests   = {};   // Fix 4: IP rate limiter

const headers = {
  "Content-Type":  "application/json",
  "apikey":        SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Prefer":        "return=representation",
};

const sb = (path) => `${SUPABASE_URL}/rest/v1/${path}`;

// ── Fix 4: IP rate limiter ─────────────────────────────────
function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function isIpRateLimited(ip) {
  const now = Date.now();
  if (!ipRequests[ip]) ipRequests[ip] = { count: 0, windowStart: now };
  const entry = ipRequests[ip];
  if (now - entry.windowStart > IP_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  return entry.count > MAX_IP_REQUESTS;
}

// ── Fix 3: Shop code brute force protection ────────────────
function isShopLockedOut(ip) {
  const entry = shopAttempts[ip];
  if (!entry) return false;
  if (entry.count >= MAX_SHOP_ATTEMPTS) {
    const elapsed = Date.now() - entry.lastAttempt;
    if (elapsed < SHOP_LOCKOUT_MS) return true;
    delete shopAttempts[ip];
  }
  return false;
}

function recordShopAttempt(ip) {
  if (!shopAttempts[ip]) shopAttempts[ip] = { count: 0, lastAttempt: 0 };
  shopAttempts[ip].count += 1;
  shopAttempts[ip].lastAttempt = Date.now();
}

function resetShopAttempts(ip) {
  delete shopAttempts[ip];
}

// ── PIN brute force protection ─────────────────────────────
function isLockedOut(shopCode) {
  const attempts = pinAttempts[shopCode];
  if (!attempts) return false;
  if (attempts.count >= MAX_PIN_ATTEMPTS) {
    const elapsed = Date.now() - attempts.lastAttempt;
    if (elapsed < PIN_LOCKOUT_MS) return true;
    delete pinAttempts[shopCode];
  }
  return false;
}

function recordFailedAttempt(shopCode) {
  if (!pinAttempts[shopCode]) pinAttempts[shopCode] = { count: 0, lastAttempt: 0 };
  pinAttempts[shopCode].count += 1;
  pinAttempts[shopCode].lastAttempt = Date.now();
}

function resetAttempts(shopCode) {
  delete pinAttempts[shopCode];
}

async function hashPin(pin) {
  const msgBuffer  = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Vercel handler ─────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Fix 4: Global IP rate limiting
  const ip = getClientIp(req);
  if (isIpRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const { action, shopCode, table, id, data, query, pin, role } = body;

  if (!shopCode) return res.status(400).json({ error: "shopCode required" });
  if (!/^[A-Z0-9]{4,20}$/.test(shopCode)) return res.status(400).json({ error: "Invalid shop code format" });

  try {

    // ── login ───────────────────────────────────────────────
    if (action === "login") {
      // Fix 3: block brute force shop code guessing
      if (isShopLockedOut(ip)) {
        const remaining = Math.ceil((SHOP_LOCKOUT_MS - (Date.now() - shopAttempts[ip].lastAttempt)) / 1000);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${remaining}s.` });
      }

      if (isLockedOut(shopCode)) {
        const remaining = Math.ceil((PIN_LOCKOUT_MS - (Date.now() - pinAttempts[shopCode].lastAttempt)) / 1000);
        return res.status(429).json({ error: `Too many attempts. Try again in ${remaining}s.` });
      }

      const r    = await fetch(sb(`settings?id=eq.${encodeURIComponent(shopCode + "::main")}`), { headers });
      const rows = await r.json();

      if (!rows || rows.length === 0) {
        // Fix 3: record failed shop code attempt
        recordShopAttempt(ip);
        return res.status(404).json({ error: "Shop not found" });
      }

      // Fix 3: reset shop attempts on valid shop found
      resetShopAttempts(ip);

      const settings  = rows[0].data;
      const hashedPin = await hashPin(pin);

      // Fix 2: only allow hashed PIN — no plain text fallback
      const correctHash = role === "admin" ? settings.adminPinHash : settings.staffPinHash;

      if (!correctHash) {
        // PIN not set up yet for this role — prompt to set it up
        return res.status(401).json({ error: "PIN not configured. Please set up your PIN in Settings." });
      }

      const pinMatch = hashedPin === correctHash;

      if (!pinMatch) {
        recordFailedAttempt(shopCode);
        const attempts  = pinAttempts[shopCode]?.count || 1;
        const remaining = MAX_PIN_ATTEMPTS - attempts;
        return res.status(401).json({
          error: `Wrong PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} left.`,
        });
      }

      resetAttempts(shopCode);
      return res.status(200).json({ success: true, role });
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

    // ── nextInvoice ─────────────────────────────────────────
    if (action === "nextInvoice") {
      const fy    = query;
      const seqId = `${shopCode}::${fy}`;
      const r1    = await fetch(sb(`invoice_seq?id=eq.${encodeURIComponent(seqId)}`), { headers });
      const existing = await r1.json();
      let nextSeq;
      if (existing && existing.length > 0) {
        nextSeq = existing[0].seq + 1;
        await fetch(sb(`invoice_seq?id=eq.${encodeURIComponent(seqId)}`), {
          method:  "PATCH",
          headers: { ...headers, "Prefer": "return=representation" },
          body:    JSON.stringify({ seq: nextSeq }),
        });
      } else {
        nextSeq = 1;
        await fetch(sb("invoice_seq"), {
          method:  "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
          body:    JSON.stringify({ id: seqId, seq: nextSeq }),
        });
      }
      return res.status(200).json({ invoiceNo: `${fy}/${String(nextSeq).padStart(3, "0")}` });
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

    // ── nextVoucher ─────────────────────────────────────────
    if (action === "nextVoucher") {
      const fy    = query;
      const seqId = `${shopCode}::RV::${fy}`;
      const r1    = await fetch(sb(`invoice_seq?id=eq.${encodeURIComponent(seqId)}`), { headers });
      const existing = await r1.json();
      let nextSeq;
      if (existing && existing.length > 0) {
        nextSeq = existing[0].seq + 1;
        await fetch(sb(`invoice_seq?id=eq.${encodeURIComponent(seqId)}`), {
          method:  "PATCH",
          headers: { ...headers, "Prefer": "return=representation" },
          body:    JSON.stringify({ seq: nextSeq }),
        });
      } else {
        nextSeq = 1;
        await fetch(sb("invoice_seq"), {
          method:  "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
          body:    JSON.stringify({ id: seqId, seq: nextSeq }),
        });
      }
      return res.status(200).json({ voucherNo: `RV-${fy}/${String(nextSeq).padStart(3, "0")}` });
    }

    return res.status(400).json({ error: "Unknown action" });

  } catch (err) {
    console.error("DB proxy error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
