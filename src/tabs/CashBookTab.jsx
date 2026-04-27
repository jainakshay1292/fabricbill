// ─────────────────────────────────────────────
// tabs/CashBookTab.jsx
// Running cash book with:
//   • Auto entries from invoices + settlements
//   • Manual journal entries (expenses, deposits, payments)
//   • Daily summary + full ledger views
//   • Export to PDF or Excel (client-side, no library)
// ─────────────────────────────────────────────

import { useState, useMemo } from "react";
import { insertJournalEntry, deleteJournalEntry } from "../lib/api";
import { genId } from "../utils/misc";

// ── Constants ─────────────────────────────────
const PAY_COLORS = {
  Cash: "#16a34a", UPI: "#2563eb", Card: "#7c3aed",
  Credit: "#dc2626", Settlement: "#0891b2",
  Expense: "#ea580c", Deposit: "#0891b2", Payment: "#7c3aed", Other: "#6b7280",
};
const PAY_ICONS = {
  Cash: "💵", UPI: "📱", Card: "💳", Credit: "📒",
  Settlement: "🤝", Expense: "💸", Deposit: "🏦", Payment: "💳", Other: "📝",
};
const ENTRY_TYPES = [
  { value: "Expense",  label: "💸 Petty Cash / Expense",  flow: "outflow" },
  { value: "Payment",  label: "💳 Cash Paid to Party",     flow: "outflow" },
  { value: "Deposit",  label: "🏦 Cash Deposited (Bank)",  flow: "outflow" },
  { value: "Other",    label: "📝 Other Entry",            flow: "both"    },
];

// ── Helpers ───────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmt(n, currency = "₹") {
  return currency + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function isoToday() { return new Date().toISOString().slice(0, 10); }

// ── Build unified entry list ──────────────────
function buildEntries(transactions, settlements, journalEntries) {
  const entries = [];

  for (const txn of transactions) {
    if (!txn.date) continue;
    if (txn.void || txn.cancelled) {
      entries.push({
        id: txn.id + "_void", date: txn.voidedAt || txn.date,
        type: "void", ref: txn.invoiceNo || txn.id,
        party: txn.customerName || "Walk-in", mode: "Void",
        amount: 0, inflow: 0, outflow: 0,
        note: "Voided: " + (txn.invoiceNo || ""), source: "auto",
      });
      continue;
    }
    const pmts = txn.payments?.length > 0
      ? txn.payments
      : [{ mode: txn.paymentMode || "Cash", amount: txn.total || 0 }];
    for (const pmt of pmts) {
      const amt = parseFloat(pmt.amount) || 0;
      if (amt === 0) continue;
      entries.push({
        id: txn.id + "_" + pmt.mode, date: txn.date,
        type: "sale", ref: txn.invoiceNo || txn.id,
        party: txn.customerName || "Walk-in", mode: pmt.mode,
        amount: amt,
        inflow:  pmt.mode !== "Credit" ? amt : 0,
        outflow: 0, note: "", source: "auto",
      });
    }
  }

  for (const s of settlements) {
    if (!s.date) continue;
    const amt = parseFloat(s.amount) || 0;
    if (!amt) continue;
    entries.push({
      id: s.id, date: s.date,
      type: "settlement", ref: s.voucherNo || s.id,
      party: s.customerName || "", mode: "Settlement",
      amount: amt, inflow: amt, outflow: 0,
      note: "Settled via " + (s.paymentMode || "Cash"), source: "auto",
    });
  }

  for (const j of journalEntries) {
    if (!j.date) continue;
    entries.push({
      id: j.id, date: j.date,
      type: j.entryType || "Other", ref: j.ref || "JE",
      party: j.party || "", mode: j.entryType || "Other",
      amount: parseFloat(j.amount) || 0,
      inflow: parseFloat(j.inflow) || 0,
      outflow: parseFloat(j.outflow) || 0,
      note: j.note || "", source: "manual", journalId: j.id,
    });
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  let balance = 0;
  for (const e of entries) {
    balance += e.inflow - e.outflow;
    e.runningBalance = Math.round(balance * 100) / 100;
  }
  return entries;
}

function groupByDay(entries) {
  const map = {};
  for (const e of entries) {
    const day = e.date.slice(0, 10);
    if (!map[day]) map[day] = [];
    map[day].push(e);
  }
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, rows]) => ({
      day, rows,
      inflow:   rows.reduce((s, r) => s + r.inflow,  0),
      outflow:  rows.reduce((s, r) => s + r.outflow, 0),
      cash:     rows.filter((r) => r.mode === "Cash").reduce((s, r) => s + r.inflow, 0),
      upi:      rows.filter((r) => r.mode === "UPI").reduce((s, r) => s + r.inflow, 0),
      card:     rows.filter((r) => r.mode === "Card").reduce((s, r) => s + r.inflow, 0),
      credit:   rows.filter((r) => r.mode === "Credit").reduce((s, r) => s + r.amount, 0),
      sett:     rows.filter((r) => r.type === "settlement").reduce((s, r) => s + r.amount, 0),
      expenses: rows.filter((r) => r.source === "manual").reduce((s, r) => s + r.outflow, 0),
      closingBalance: rows[rows.length - 1]?.runningBalance ?? 0,
    }));
}

// ── Excel export ─────────────────────────────
function exportToExcel(entries, settings, fromDate, toDate) {
  const shopName = settings?.shopName || "Shop";
  const currency = settings?.currency || "₹";
  const rows = [
    ["Cash Book — " + shopName],
    ["Period: " + fmtDate(fromDate + "T00:00:00") + " to " + fmtDate(toDate + "T00:00:00")],
    [],
    ["Date", "Time", "Ref", "Party", "Type", "Inflow (" + currency + ")", "Outflow (" + currency + ")", "Balance (" + currency + ")", "Note"],
    ...entries.map((e) => [
      fmtDate(e.date), fmtTime(e.date), e.ref, e.party,
      e.type === "sale" ? e.mode + " Sale" : e.type === "settlement" ? "Settlement" : e.type === "void" ? "Voided" : e.mode,
      e.inflow  > 0 ? fmtNum(e.inflow)  : "",
      e.outflow > 0 ? fmtNum(e.outflow) : "",
      fmtNum(e.runningBalance), e.note || "",
    ]),
    [],
    ["TOTAL INFLOW",  "", "", "", "", fmtNum(entries.reduce((s, e) => s + e.inflow,  0))],
    ["TOTAL OUTFLOW", "", "", "", "", "", fmtNum(entries.reduce((s, e) => s + e.outflow, 0))],
    ["CLOSING BALANCE", "", "", "", "", "", "", fmtNum(entries[entries.length - 1]?.runningBalance || 0)],
  ];
  const tsv  = rows.map((r) => r.join("\t")).join("\n");
  const blob = new Blob(["\uFEFF" + tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "CashBook_" + shopName + "_" + fromDate + "_" + toDate + ".xls";
  a.click(); URL.revokeObjectURL(url);
}

// ── PDF export ───────────────────────────────
function exportToPDF(entries, settings, fromDate, toDate, totals) {
  const shopName = settings?.shopName || "Shop";
  const currency = settings?.currency || "₹";
  const f = (n) => currency + fmtNum(n);
  const tableRows = entries.map((e) =>
    "<tr>" +
    "<td>" + fmtDate(e.date) + "</td>" +
    "<td style='color:#6b7280;font-size:11px'>" + fmtTime(e.date) + "</td>" +
    "<td><b>" + e.ref + "</b></td>" +
    "<td>" + (e.party || "") + "</td>" +
    "<td><span style='padding:2px 6px;border-radius:8px;background:" + (PAY_COLORS[e.mode] || "#e5e7eb") + "22;color:" + (PAY_COLORS[e.mode] || "#374151") + ";font-size:10px;font-weight:700'>" +
      (e.type === "sale" ? e.mode : e.type === "settlement" ? "Settlement" : e.type === "void" ? "Voided" : e.mode) +
    "</span></td>" +
    "<td style='text-align:right;color:#16a34a;font-weight:700'>" + (e.inflow  > 0 ? f(e.inflow)  : "—") + "</td>" +
    "<td style='text-align:right;color:#ea580c;font-weight:700'>" + (e.outflow > 0 ? f(e.outflow) : "—") + "</td>" +
    "<td style='text-align:right;font-weight:700;color:#1e3a5f'>" + f(e.runningBalance) + "</td>" +
    "<td style='color:#9ca3af;font-size:10px'>" + (e.note || "") + "</td>" +
    "</tr>"
  ).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Cash Book — ${shopName}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:16px}
  h1{font-size:18px;color:#1e3a5f;margin:0 0 2px}
  .meta{color:#6b7280;font-size:12px;margin-bottom:14px}
  .summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;min-width:100px}
  .card .lbl{font-size:10px;color:#6b7280;font-weight:700}
  .card .val{font-size:14px;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
  td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
  tr:nth-child(even) td{background:#f9fafb}
  @media print{button{display:none}}
</style></head><body>
<h1>📒 Cash Book — ${shopName}</h1>
<div class="meta">Period: ${fmtDate(fromDate + "T00:00:00")} → ${fmtDate(toDate + "T00:00:00")} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString("en-IN")}</div>
<div class="summary">
  <div class="card"><div class="lbl">💵 Cash</div><div class="val" style="color:#16a34a">${f(totals.cash)}</div></div>
  <div class="card"><div class="lbl">📱 UPI</div><div class="val" style="color:#2563eb">${f(totals.upi)}</div></div>
  <div class="card"><div class="lbl">💳 Card</div><div class="val" style="color:#7c3aed">${f(totals.card)}</div></div>
  <div class="card"><div class="lbl">📒 Credit</div><div class="val" style="color:#dc2626">${f(totals.credit)}</div></div>
  <div class="card"><div class="lbl">🤝 Settled</div><div class="val" style="color:#0891b2">${f(totals.sett)}</div></div>
  <div class="card"><div class="lbl">💸 Expenses</div><div class="val" style="color:#ea580c">${f(totals.expenses)}</div></div>
  <div class="card" style="background:#1e3a5f"><div class="lbl" style="color:#93c5fd">NET INFLOW</div><div class="val" style="color:#fff">${f(totals.inflow + totals.sett - totals.expenses)}</div></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Time</th><th>Ref</th><th>Party</th><th>Type</th><th>Inflow</th><th>Outflow</th><th>Balance</th><th>Note</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html); win.document.close();
}

// ── Add Entry Modal ───────────────────────────
function AddEntryModal({ onSave, onCancel, currency }) {
  const [entryType, setEntryType] = useState("Expense");
  const [party,     setParty]     = useState("");
  const [amount,    setAmount]    = useState("");
  const [note,      setNote]      = useState("");
  const [date,      setDate]      = useState(isoToday());
  const [flow,      setFlow]      = useState("outflow");

  const typeInfo = ENTRY_TYPES.find((t) => t.value === entryType);

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert("Enter a valid amount."); return; }
    if (!note.trim()) { alert("Please enter a description."); return; }
    const isOut = typeInfo?.flow === "outflow" || (typeInfo?.flow === "both" && flow === "outflow");
    onSave({
      entryType, party: party.trim(), amount: amt,
      inflow:  isOut ? 0 : amt,
      outflow: isOut ? amt : 0,
      note: note.trim(),
      date: new Date(date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
    });
  };

  const inp = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box", background: "#fff" };
  const lbl = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 16 }}>📝 Add Journal Entry</div>

        {/* Entry type grid */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Entry Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {ENTRY_TYPES.map((t) => (
              <button key={t.value}
                onClick={() => { setEntryType(t.value); setFlow(t.flow === "both" ? "outflow" : t.flow); }}
                style={{ padding: "10px 8px", border: "2px solid " + (entryType === t.value ? (PAY_COLORS[t.value] || "#1e3a5f") : "#e5e7eb"), borderRadius: 10, background: entryType === t.value ? (PAY_COLORS[t.value] || "#1e3a5f") + "18" : "#fff", color: entryType === t.value ? (PAY_COLORS[t.value] || "#1e3a5f") : "#374151", fontWeight: 700, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inflow/Outflow toggle for "Other" */}
        {typeInfo?.flow === "both" && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Direction</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["outflow", "inflow"].map((fl) => (
                <button key={fl} onClick={() => setFlow(fl)}
                  style={{ flex: 1, padding: "9px 0", border: "2px solid " + (flow === fl ? (fl === "inflow" ? "#16a34a" : "#dc2626") : "#e5e7eb"), borderRadius: 8, background: flow === fl ? (fl === "inflow" ? "#f0fdf4" : "#fff1f2") : "#fff", color: flow === fl ? (fl === "inflow" ? "#16a34a" : "#dc2626") : "#6b7280", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {fl === "inflow" ? "↑ Inflow (Received)" : "↓ Outflow (Paid)"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        </div>

        {/* Party */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Party / Vendor <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span></label>
          <input value={party} onChange={(e) => setParty(e.target.value)}
            placeholder="e.g. Ramesh Supplier, SBI Bank" style={inp} />
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Amount ({currency})</label>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" style={{ ...inp, fontSize: 20, fontWeight: 800 }} />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Description *</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Tea & snacks, Electricity bill, Bank deposit" style={inp} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave}
            style={{ flex: 2, padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
            ✅ Save Entry
          </button>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main CashBookTab ──────────────────────────
export function CashBookTab({ transactions, settlements, journalEntries = [], setJournalEntries, settings, shopCode }) {
  const currency = settings?.currency || "₹";
  const f        = (n) => fmt(n, currency);

  const today        = isoToday();
  const firstOfMonth = today.slice(0, 7) + "-01";

  const [view,         setView]         = useState("daily");
  const [fromDate,     setFromDate]     = useState(firstOfMonth);
  const [toDate,       setToDate]       = useState(today);
  const [expanded,     setExpanded]     = useState({});
  const [modeFilter,   setModeFilter]   = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleting,     setDeleting]     = useState(null);

  const allEntries = useMemo(
    () => buildEntries(transactions, settlements, journalEntries),
    [transactions, settlements, journalEntries]
  );

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const to   = toDate   ? new Date(toDate   + "T23:59:59") : null;
    return allEntries.filter((e) => {
      const d = new Date(e.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      if (modeFilter === "Manual" && e.source !== "manual") return false;
      if (modeFilter !== "All" && modeFilter !== "Manual" && e.mode !== modeFilter) return false;
      return true;
    });
  }, [allEntries, fromDate, toDate, modeFilter]);

  const totals = useMemo(() => ({
    inflow:   filtered.reduce((s, e) => s + e.inflow,  0),
    outflow:  filtered.reduce((s, e) => s + e.outflow, 0),
    cash:     filtered.filter((e) => e.mode === "Cash").reduce((s, e) => s + e.inflow, 0),
    upi:      filtered.filter((e) => e.mode === "UPI").reduce((s, e) => s + e.inflow, 0),
    card:     filtered.filter((e) => e.mode === "Card").reduce((s, e) => s + e.inflow, 0),
    credit:   filtered.filter((e) => e.mode === "Credit").reduce((s, e) => s + e.amount, 0),
    sett:     filtered.filter((e) => e.type === "settlement").reduce((s, e) => s + e.amount, 0),
    expenses: filtered.filter((e) => e.source === "manual").reduce((s, e) => s + e.outflow, 0),
  }), [filtered]);

  const days = useMemo(() => groupByDay(filtered), [filtered]);

  const ledgerEntries = useMemo(() => {
    let bal = 0;
    return [...filtered]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((e) => { bal += e.inflow - e.outflow; return { ...e, windowBalance: Math.round(bal * 100) / 100 }; })
      .reverse();
  }, [filtered]);

  const exportEntries = useMemo(() =>
    [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [filtered]
  );

  const handleAddEntry = async (data) => {
    const entry = { id: genId(), ...data };
    await insertJournalEntry(shopCode, entry);
    setJournalEntries((p) => [entry, ...p]);
    setShowAddModal(false);
  };

  const handleDeleteEntry = async (journalId) => {
    if (!window.confirm("Delete this entry?")) return;
    setDeleting(journalId);
    try {
      await deleteJournalEntry(shopCode, journalId);
      setJournalEntries((p) => p.filter((e) => e.id !== journalId));
    } finally { setDeleting(null); }
  };

  const toggleDay = (day) => setExpanded((p) => ({ ...p, [day]: !p[day] }));

  const MODES = ["All", "Cash", "UPI", "Card", "Credit", "Settlement", "Manual"];

  // ── Entry row renderer (shared by daily + ledger) ──
  const EntryRow = ({ e, showBalance }) => (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{PAY_ICONS[e.mode] || "📝"}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f" }}>{e.ref}</span>
          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10,
            background: e.source === "manual" ? "#fff7ed" : e.type === "void" ? "#fee2e2" : e.type === "settlement" ? "#f0fdfa" : "#f3f4f6",
            color: e.source === "manual" ? "#ea580c" : e.type === "void" ? "#dc2626" : e.type === "settlement" ? "#0891b2" : (PAY_COLORS[e.mode] || "#6b7280"),
            fontWeight: 700 }}>
            {e.source === "manual" ? e.mode : e.type === "settlement" ? "Settlement" : e.type === "void" ? "Voided" : e.mode}
          </span>
        </div>
        {e.party && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{e.party}</div>}
        {e.note  && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{e.note}</div>}
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{fmtTime(e.date)}</div>
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14,
            color: e.outflow > 0 ? "#ea580c" : e.type === "void" ? "#9ca3af" : e.mode === "Credit" ? "#dc2626" : "#16a34a" }}>
            {e.type === "void" ? "—"
              : e.outflow > 0 ? "-" + f(e.outflow)
              : (e.mode === "Credit" ? "📒 " : "+") + f(e.amount)}
          </div>
          {showBalance && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Bal: <span style={{ fontWeight: 700, color: "#1e3a5f" }}>{f(e.windowBalance ?? e.runningBalance)}</span>
            </div>
          )}
        </div>
        {e.source === "manual" && (
          <button onClick={() => handleDeleteEntry(e.journalId)}
            disabled={deleting === e.journalId}
            style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "5px 8px", cursor: "pointer", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {deleting === e.journalId ? "…" : "✕"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", padding: "16px 16px 20px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>📒 Cash Book</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Running account of all money</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => exportToExcel(exportEntries, settings, fromDate, toDate)}
              style={{ padding: "8px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📊 Excel
            </button>
            <button onClick={() => exportToPDF(exportEntries, settings, fromDate, toDate, totals)}
              style={{ padding: "8px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📄 PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Date filter ── */}
      <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["FROM", fromDate, setFromDate], ["TO", toDate, setToDate]].map(([label, val, setter]) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 3 }}>{label}</div>
              <input type="date" value={val} onChange={(e) => setter(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["Today",      today, today],
            ["This Week",  (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10); })(), today],
            ["This Month", firstOfMonth, today],
            ["Last 30d",   (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); })(), today],
          ].map(([label, fr, to]) => (
            <button key={label} onClick={() => { setFromDate(fr); setToDate(to); }}
              style={{ padding: "5px 10px", background: fromDate === fr && toDate === to ? "#1e3a5f" : "#fff", color: fromDate === fr && toDate === to ? "#fff" : "#374151", border: "1px solid #d1d5db", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          {[
            ["💵 Cash",   totals.cash,   "#16a34a", "#f0fdf4"],
            ["📱 UPI",    totals.upi,    "#2563eb", "#eff6ff"],
            ["💳 Card",   totals.card,   "#7c3aed", "#f5f3ff"],
            ["📒 Credit", totals.credit, "#dc2626", "#fff1f2"],
          ].map(([label, val, color, bg]) => (
            <div key={label} style={{ background: bg, border: "1px solid " + color + "33", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color }}>{f(val)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ background: "#f0fdfa", border: "1px solid #0891b233", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>🤝 Settled</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0891b2" }}>{f(totals.sett)}</div>
          </div>
          <div style={{ background: "#fff7ed", border: "1px solid #ea580c33", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>💸 Expenses / Paid</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#ea580c" }}>{f(totals.expenses)}</div>
          </div>
        </div>
        <div style={{ background: "#1e3a5f", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: "#93c5fd", fontSize: 13, fontWeight: 700 }}>Net (Inflow − Expenses)</div>
          <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{f(totals.inflow + totals.sett - totals.expenses)}</div>
        </div>
      </div>

      {/* ── Add Entry + controls ── */}
      <div style={{ padding: "0 16px 12px" }}>
        <button onClick={() => setShowAddModal(true)}
          style={{ width: "100%", padding: "12px 0", background: "linear-gradient(90deg,#1e3a5f,#2563eb)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>
          ＋ Add Journal Entry
        </button>
        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 10, padding: 3, marginBottom: 10 }}>
          {[["daily", "📅 Daily"], ["ledger", "📋 Ledger"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ flex: 1, padding: "8px 0", background: view === v ? "#1e3a5f" : "transparent", color: view === v ? "#fff" : "#6b7280", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {MODES.map((m) => (
            <button key={m} onClick={() => setModeFilter(m)}
              style={{ padding: "5px 12px", whiteSpace: "nowrap", background: modeFilter === m ? (PAY_COLORS[m] || "#1e3a5f") : "#fff", color: modeFilter === m ? "#fff" : "#374151", border: "1px solid #d1d5db", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {m === "All" ? "All" : m === "Manual" ? "📝 Manual" : (PAY_ICONS[m] || "") + " " + m}
            </button>
          ))}
        </div>
      </div>

      {/* ── Daily Summary ── */}
      {view === "daily" && (
        <div style={{ padding: "0 16px" }}>
          {days.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>No entries in this range</div>}
          {days.map(({ day, rows, cash, upi, card, credit, sett, expenses, inflow, closingBalance }) => (
            <div key={day} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
              <div onClick={() => toggleDay(day)}
                style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: expanded[day] ? "#f0f9ff" : "#fff" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1e3a5f" }}>{fmtDate(day + "T00:00:00")}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{rows.length} entr{rows.length === 1 ? "y" : "ies"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#16a34a" }}>+{f(inflow + sett)}</div>
                  {expenses > 0 && <div style={{ fontSize: 12, color: "#ea580c", fontWeight: 700 }}>-{f(expenses)}</div>}
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Bal: {f(closingBalance)}</div>
                </div>
              </div>
              {/* Mode chips */}
              <div style={{ padding: "0 14px 10px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: expanded[day] ? "1px solid #e5e7eb" : "none" }}>
                {cash     > 0 && <span style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>💵 {f(cash)}</span>}
                {upi      > 0 && <span style={{ background: "#eff6ff", color: "#2563eb", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>📱 {f(upi)}</span>}
                {card     > 0 && <span style={{ background: "#f5f3ff", color: "#7c3aed", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>💳 {f(card)}</span>}
                {credit   > 0 && <span style={{ background: "#fff1f2", color: "#dc2626", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>📒 {f(credit)} credit</span>}
                {sett     > 0 && <span style={{ background: "#f0fdfa", color: "#0891b2", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>🤝 {f(sett)}</span>}
                {expenses > 0 && <span style={{ background: "#fff7ed", color: "#ea580c", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>💸 -{f(expenses)}</span>}
              </div>
              {expanded[day] && rows.map((e) => <EntryRow key={e.id} e={e} showBalance />)}
            </div>
          ))}
        </div>
      )}

      {/* ── Full Ledger ── */}
      {view === "ledger" && (
        <div style={{ padding: "0 16px" }}>
          {ledgerEntries.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "32px 0" }}>No entries in this range</div>}
          {ledgerEntries.length > 0 && (
            <div style={{ background: "#1e3a5f", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700 }}>CLOSING BALANCE</div>
              <div style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}>{f(ledgerEntries[0]?.windowBalance ?? 0)}</div>
            </div>
          )}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            {ledgerEntries.map((e) => <EntryRow key={e.id} e={e} showBalance />)}
          </div>
        </div>
      )}

      {/* ── Add Entry Modal ── */}
      {showAddModal && (
        <AddEntryModal currency={currency} onSave={handleAddEntry} onCancel={() => setShowAddModal(false)} />
      )}
    </div>
  );
}
