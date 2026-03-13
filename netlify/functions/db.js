// ─────────────────────────────────────────────────────────────
// Netlify Function — DB Proxy
// Supabase key never leaves the server.
// All requests from the frontend go through here.
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service key, not anon key
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 1000; // 30 seconds in ms

// In-memory store for PIN lockouts (resets on function cold start)
// For production, use Supabase or Redis instead
const pinAttempts = {};

const headers = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Prefer": "return=representation",
};

// ── Helpers ──────────────────────────────────────────────────
const sb = (path) => `${SUPABASE_URL}/rest/v1/${path}`;

function isLockedOut(shopCode) {
  const attempts = pinAttempts[shopCode];
  if (!attempts) return false;
  if (attempts.count >= MAX_PIN_ATTEMPTS) {
    const elapsed = Date.now() - attempts.lastAttempt;
    if (elapsed < LOCKOUT_DURATION) return true;
    // Lockout expired — reset
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

// ── SHA-256 PIN hashing ───────────────────────────────────────
async function hashPin(pin) {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Main handler ─────────────────────────────────────────────
exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { action, shopCode, table, id, data, query, pin, role } = body;

  // shopCode required for all actions
  if (!shopCode) {
    return { statusCode: 400, body: JSON.stringify({ error: "shopCode required" }) };
  }

  // Validate shopCode format (alphanumeric only, 4-20 chars)
  if (!/^[A-Z0-9]{4,20}$/.test(shopCode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid shop code format" }) };
  }

  try {
    // ── ACTION: verify PIN login ────────────────────────────
    if (action === "login") {
      if (isLockedOut(shopCode)) {
        const remaining = Math.ceil((LOCKOUT_DURATION - (Date.now() - pinAttempts[shopCode].lastAttempt)) / 1000);
        return { statusCode: 429, body: JSON.stringify({ error: `Too many attempts. Try again in ${remaining}s.` }) };
      }

      // Fetch settings for this shop
      const r = await fetch(sb(`settings?id=eq.${encodeURIComponent(shopCode + "::main")}`), { headers });
      const rows = await r.json();
      if (!rows || rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: "Shop not found" }) };
      }

      const settings = rows[0].data;
      const hashedPin = await hashPin(pin);
      const correctHash = role === "admin" ? settings.adminPinHash : settings.staffPinHash;

      // Fallback: support plain PIN for shops not yet migrated
      const correctPlain = role === "admin" ? settings.adminPin : settings.staffPin;
      const pinMatch = correctHash ? hashedPin === correctHash : pin === correctPlain;

      if (!pinMatch) {
        recordFailedAttempt(shopCode);
        const attempts = pinAttempts[shopCode]?.count || 1;
        const remaining = MAX_PIN_ATTEMPTS - attempts;
        return { statusCode: 401, body: JSON.stringify({ error: `Wrong PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} left.` }) };
      }

      resetAttempts(shopCode);
      return { statusCode: 200, body: JSON.stringify({ success: true, role }) };
    }

    // ── ACTION: get single row ──────────────────────────────
    if (action === "get") {
      const fullId = `${shopCode}::${id}`;
      const r = await fetch(sb(`${table}?id=eq.${encodeURIComponent(fullId)}`), { headers });
      const rows = await r.json();
      return { statusCode: 200, body: JSON.stringify(rows && rows.length > 0 ? rows[0].data : null) };
    }

    // ── ACTION: get all rows for shop ───────────────────────
    if (action === "getAll") {
      const order = table === "products" ? "created_at.asc" : "created_at.desc";
      const r = await fetch(sb(`${table}?id=like.${encodeURIComponent(shopCode + "::")}*&order=${order}`), { headers });
      const rows = await r.json();
      return { statusCode: 200, body: JSON.stringify(Array.isArray(rows) ? rows.map(r => r.data) : []) };
    }

    // ── ACTION: upsert ──────────────────────────────────────
    if (action === "upsert") {
      const fullId = `${shopCode}::${id}`;
      await fetch(sb(table), {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ id: fullId, data }),
      });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // ── ACTION: insert ──────────────────────────────────────
    if (action === "insert") {
      const fullId = `${shopCode}::${data.id}`;
      await fetch(sb(table), {
        method: "POST",
        headers,
        body: JSON.stringify({ id: fullId, data }),
      });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // ── ACTION: delete ──────────────────────────────────────
    if (action === "delete") {
      const fullId = `${shopCode}::${id}`;
      await fetch(sb(`${table}?id=eq.${encodeURIComponent(fullId)}`), { method: "DELETE", headers });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // ── ACTION: get next invoice number ────────────────────
    if (action === "nextInvoice") {
      const fy = query; // financial year string e.g. "2025-26"
      const seqId = `${shopCode}::${fy}`;
      const r1 = await fetch(sb(`invoice_seq?id=eq.${encodeURIComponent(seqId)}`), { headers });
      const existing = await r1.json();
      let nextSeq;
      if (existing && existing.length > 0) {
        nextSeq = existing[0].seq + 1;
        await fetch(sb(`invoice_seq?id=eq.${encodeURIComponent(seqId)}`), {
          method: "PATCH",
          headers: { ...headers, "Prefer": "return=representation" },
          body: JSON.stringify({ seq: nextSeq }),
        });
      } else {
        nextSeq = 1;
        await fetch(sb("invoice_seq"), {
          method: "POST",
          headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ id: seqId, seq: nextSeq }),
        });
      }
      return { statusCode: 200, body: JSON.stringify({ invoiceNo: `${fy}/${String(nextSeq).padStart(3, "0")}` }) };
    }

    // ── ACTION: validate invoice edit (server-side 24hr check)
    if (action === "validateEdit") {
      const fullId = `${shopCode}::${id}`;
      const r = await fetch(sb(`transactions?id=eq.${encodeURIComponent(fullId)}`), { headers });
      const rows = await r.json();
      if (!rows || rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: "Invoice not found" }) };
      }
      const txn = rows[0].data;
      const createdAt = new Date(txn.date).getTime();
      const within24h = (Date.now() - createdAt) < 24 * 60 * 60 * 1000;
      if (!within24h) {
        return { statusCode: 403, body: JSON.stringify({ error: "Invoice can only be edited within 24 hours of creation." }) };
      }
      return { statusCode: 200, body: JSON.stringify({ allowed: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action" }) };

  } catch (err) {
    console.error("DB proxy error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
