// ─────────────────────────────────────────────
// tabs/CashBookTab.jsx
// Running cash book — shows every cash movement
// in chronological order with a running balance.
//
// Entries include:
//   • Sales invoices (cash/UPI/card/credit portions)
//   • Credit settlements (cash received later)
//   • Voided invoices (reversal entries)
//
// Views:
//   • Daily summary  — one row per day, expandable
//   • Full ledger    — every entry with running balance
//   • Date range filter for both views
// ─────────────────────────────────────────────

import { useState, useMemo } from "react";

const PAY_COLORS = {
  Cash:   "#16a34a",
  UPI:    "#2563eb",
  Card:   "#7c3aed",
  Credit: "#dc2626",
  Settlement: "#0891b2",
};

const PAY_ICONS = {
  Cash:   "💵",
  UPI:    "📱",
  Card:   "💳",
  Credit: "📒",
  Settlement: "🤝",
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmt(n, currency = "₹") {
  return currency + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Build flat list of cash-book entries from transactions + settlements
function buildEntries(transactions, settlements) {
  const entries = [];

  // ── Invoice entries ──────────────────────────
  for (const txn of transactions) {
    if (!txn.date) continue;

    if (txn.void || txn.cancelled) {
      // Voided invoice — add a reversal entry if it had a non-zero total
      if (txn.total && txn.total !== 0) {
        entries.push({
          id:       txn.id + "_void",
          date:     txn.voidedAt || txn.date,
          type:     "void",
          ref:      txn.invoiceNo || txn.id,
          party:    txn.customerName || "Walk-in",
          mode:     "Void",
          amount:   0,
          inflow:   0,
          outflow:  0,
          note:     `Voided invoice ${txn.invoiceNo || ""}`,
          txnId:    txn.id,
        });
      }
      continue;
    }

    // Split multi-payment invoices into one entry per mode
    const pmts = txn.payments?.length > 0
      ? txn.payments
      : [{ mode: txn.paymentMode || "Cash", amount: txn.total || 0 }];

    for (const pmt of pmts) {
      const amt = parseFloat(pmt.amount) || 0;
      if (amt === 0) continue;
      entries.push({
        id:      txn.id + "_" + pmt.mode,
        date:    txn.date,
        type:    "sale",
        ref:     txn.invoiceNo || txn.id,
        party:   txn.customerName || "Walk-in",
        mode:    pmt.mode,
        amount:  amt,
        inflow:  pmt.mode !== "Credit" ? amt : 0,  // Credit = not received yet
        outflow: 0,
        note:    "",
        txnId:   txn.id,
      });
    }
  }

  // ── Settlement entries ───────────────────────
  for (const s of settlements) {
    if (!s.date) continue;
    const amt = parseFloat(s.amount) || 0;
    if (amt === 0) continue;
    entries.push({
      id:      s.id,
      date:    s.date,
      type:    "settlement",
      ref:     s.voucherNo || s.id,
      party:   s.customerName || "",
      mode:    "Settlement",
      amount:  amt,
      inflow:  amt,
      outflow: 0,
      note:    `Credit settled via ${s.paymentMode || "Cash"}`,
      txnId:   null,
    });
  }

  // Sort chronologically (oldest first for running balance)
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Attach running balance (inflow - outflow cumulative)
  let balance = 0;
  for (const e of entries) {
    balance += e.inflow - e.outflow;
    e.runningBalance = Math.round(balance * 100) / 100;
  }

  return entries;
}

// Group entries by date string (YYYY-MM-DD)
function groupByDay(entries) {
  const map = {};
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(e);
  }
  // Return sorted newest-first for display
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, rows]) => {
      const inflow  = rows.reduce((s, r) => s + r.inflow,  0);
      const outflow = rows.reduce((s, r) => s + r.outflow, 0);
      const cash    = rows.filter((r) => r.mode === "Cash").reduce((s, r) => s + r.inflow, 0);
      const upi     = rows.filter((r) => r.mode === "UPI").reduce((s, r) => s + r.inflow, 0);
      const card    = rows.filter((r) => r.mode === "Card").reduce((s, r) => s + r.inflow, 0);
      const credit  = rows.filter((r) => r.mode === "Credit").reduce((s, r) => s + r.amount, 0);
      const sett    = rows.filter((r) => r.type === "settlement").reduce((s, r) => s + r.amount, 0);
      const closingBalance = rows[rows.length - 1]?.runningBalance ?? 0;
      return { day, rows, inflow, outflow, cash, upi, card, credit, sett, closingBalance };
    });
}

export function CashBookTab({ transactions, settlements, settings, isAdmin }) {
  const currency = settings?.currency || "₹";
  const f        = (n) => fmt(n, currency);

  const today      = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 7) + "-01";

  const [view,      setView]      = useState("daily");   // "daily" | "ledger"
  const [fromDate,  setFromDate]  = useState(firstOfMonth);
  const [toDate,    setToDate]    = useState(today);
  const [expanded,  setExpanded]  = useState({});         // day → bool
  const [modeFilter, setModeFilter] = useState("All");    // "All"|"Cash"|"UPI"|"Card"|"Credit"|"Settlement"

  // Build all entries once
  const allEntries = useMemo(
    () => buildEntries(transactions, settlements),
    [transactions, settlements]
  );

  // Filter by date range
  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to   = toDate   ? new Date(toDate   + "T23:59:59") : null;
    return allEntries.filter((e) => {
      const d = new Date(e.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      if (modeFilter !== "All" && e.mode !== modeFilter) return false;
      return true;
    });
  }, [allEntries, fromDate, toDate, modeFilter]);

  // Summary totals for filtered range
  const totals = useMemo(() => ({
    inflow:  filtered.reduce((s, e) => s + e.inflow,  0),
    outflow: filtered.reduce((s, e) => s + e.outflow, 0),
    cash:    filtered.filter((e) => e.mode === "Cash").reduce((s, e) => s + e.inflow, 0),
    upi:     filtered.filter((e) => e.mode === "UPI").reduce((s, e) => s + e.inflow, 0),
    card:    filtered.filter((e) => e.mode === "Card").reduce((s, e) => s + e.inflow, 0),
    credit:  filtered.filter((e) => e.mode === "Credit").reduce((s, e) => s + e.amount, 0),
    sett:    filtered.filter((e) => e.type === "settlement").reduce((s, e) => s + e.amount, 0),
  }), [filtered]);

  const days = useMemo(() => groupByDay(filtered), [filtered]);

  // Re-compute running balance within filtered window only
  const ledgerEntries = useMemo(() => {
    let bal = 0;
    return [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date)).map((e) => {
      bal += e.inflow - e.outflow;
      return { ...e, windowBalance: Math.round(bal * 100) / 100 };
    }).reverse(); // newest first for display
  }, [filtered]);

  const toggleDay = (day) => setExpanded((p) => ({ ...p, [day]: !p[day] }));

  const MODES = ["All", "Cash", "UPI", "Card", "Credit", "Settlement"];

  return (
    <div style={{ padding: "0 0 80px" }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", padding: "16px 16px 20px", color: "#fff" }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>📒 Cash Book</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Running account of all money received</div>
      </div>

      {/* ── Date filter ── */}
      <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 3 }}>FROM</div>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 3 }}>TO</div>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Quick range buttons */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["Today", today, today],
            ["This Week", (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10); })(), today],
            ["This Month", firstOfMonth, today],
            ["Last 30d", (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); })(), today],
          ].map(([label, f, t]) => (
            <button key={label} onClick={() => { setFromDate(f); setToDate(t); }}
              style={{ padding: "5px 10px", background: fromDate === f && toDate === t ? "#1e3a5f" : "#fff", color: fromDate === f && toDate === t ? "#fff" : "#374151", border: "1px solid #d1d5db", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          {[
            ["💵 Cash Received", totals.cash,   "#16a34a", "#f0fdf4"],
            ["📱 UPI Received",  totals.upi,    "#2563eb", "#eff6ff"],
            ["💳 Card Received", totals.card,   "#7c3aed", "#f5f3ff"],
            ["📒 Credit Billed", totals.credit, "#dc2626", "#fff1f2"],
          ].map(([label, val, color, bg]) => (
            <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color }}>{f(val)}</div>
            </div>
          ))}
        </div>
        {totals.sett > 0 && (
          <div style={{ background: "#f0fdfa", border: "1px solid #0891b222", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>🤝 Credit Settled (received)</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0891b2" }}>{f(totals.sett)}</div>
          </div>
        )}
        <div style={{ background: "#1e3a5f", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#93c5fd", fontSize: 13, fontWeight: 700 }}>Total Inflow (period)</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{f(totals.inflow + totals.sett)}</div>
        </div>
      </div>

      {/* ── View toggle + mode filter ── */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3, marginBottom: 10 }}>
          {[["daily", "📅 Daily Summary"], ["ledger", "📋 Full Ledger"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ flex: 1, padding: "8px 0", background: view === v ? "#1e3a5f" : "transparent", color: view === v ? "#fff" : "#6b7280", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>

        {/* Mode filter pills */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {MODES.map((m) => (
            <button key={m} onClick={() => setModeFilter(m)}
              style={{ padding: "5px 12px", whiteSpace: "nowrap", background: modeFilter === m ? (PAY_COLORS[m] || "#1e3a5f") : "#fff", color: modeFilter === m ? "#fff" : "#374151", border: "1px solid #d1d5db", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {m !== "All" ? (PAY_ICONS[m] || "") + " " : ""}{m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Daily Summary View ── */}
      {view === "daily" && (
        <div style={{ padding: "0 16px" }}>
          {days.length === 0 && (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>No entries in this range</div>
          )}
          {days.map(({ day, rows, cash, upi, card, credit, sett, inflow, closingBalance }) => (
            <div key={day} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>

              {/* Day header */}
              <div onClick={() => toggleDay(day)}
                style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: expanded[day] ? "#f0f9ff" : "#fff" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1e3a5f" }}>{fmtDate(day + "T00:00:00")}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{rows.length} entr{rows.length === 1 ? "y" : "ies"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#16a34a" }}>+{f(inflow + sett)}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Bal: {f(closingBalance)}</div>
                </div>
              </div>

              {/* Mode chips */}
              <div style={{ padding: "0 14px 10px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: expanded[day] ? "1px solid #e5e7eb" : "none" }}>
                {cash   > 0 && <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>💵 {f(cash)}</span>}
                {upi    > 0 && <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>📱 {f(upi)}</span>}
                {card   > 0 && <span style={{ background: "#f5f3ff", color: "#7c3aed", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>💳 {f(card)}</span>}
                {credit > 0 && <span style={{ background: "#fff1f2", color: "#dc2626", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>📒 {f(credit)} credit</span>}
                {sett   > 0 && <span style={{ background: "#f0fdfa", color: "#0891b2", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>🤝 {f(sett)} settled</span>}
              </div>

              {/* Expanded entries */}
              {expanded[day] && (
                <div>
                  {rows.map((e) => (
                    <div key={e.id} style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13 }}>{PAY_ICONS[e.mode] || "•"}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f" }}>{e.ref}</span>
                          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: e.type === "void" ? "#fee2e2" : "#f3f4f6", color: e.type === "void" ? "#dc2626" : "#6b7280", fontWeight: 600 }}>
                            {e.type === "settlement" ? "Settlement" : e.type === "void" ? "Voided" : e.mode}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{e.party} · {fmtTime(e.date)}</div>
                        {e.note && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{e.note}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: e.type === "void" ? "#9ca3af" : e.mode === "Credit" ? "#dc2626" : "#16a34a" }}>
                          {e.type === "void" ? "—" : (e.mode === "Credit" ? "📒 " : "+") + f(e.amount)}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>Bal: {f(e.runningBalance)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Full Ledger View ── */}
      {view === "ledger" && (
        <div style={{ padding: "0 16px" }}>
          {ledgerEntries.length === 0 && (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>No entries in this range</div>
          )}

          {/* Closing balance banner */}
          {ledgerEntries.length > 0 && (
            <div style={{ background: "#1e3a5f", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700 }}>CLOSING BALANCE</div>
              <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>{f(ledgerEntries[0]?.windowBalance ?? 0)}</div>
            </div>
          )}

          {ledgerEntries.map((e, idx) => {
            const isCredit = e.mode === "Credit";
            const isVoid   = e.type === "void";
            return (
              <div key={e.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14 }}>{PAY_ICONS[e.mode] || "•"}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "#1e3a5f" }}>{e.ref}</span>
                      <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10,
                        background: isVoid ? "#fee2e2" : e.type === "settlement" ? "#f0fdfa" : "#f3f4f6",
                        color: isVoid ? "#dc2626" : e.type === "settlement" ? "#0891b2" : PAY_COLORS[e.mode] || "#6b7280",
                        fontWeight: 700 }}>
                        {e.type === "settlement" ? "Settlement" : isVoid ? "Voided" : e.mode}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{e.party}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{fmtDate(e.date)} {fmtTime(e.date)}</div>
                    {e.note && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{e.note}</div>}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 90 }}>
                    <div style={{ fontWeight: 800, fontSize: 15,
                      color: isVoid ? "#9ca3af" : isCredit ? "#dc2626" : "#16a34a" }}>
                      {isVoid ? "—" : isCredit ? "📒 " + f(e.amount) : "+" + f(e.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      Bal: <span style={{ fontWeight: 700, color: "#1e3a5f" }}>{f(e.windowBalance)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
