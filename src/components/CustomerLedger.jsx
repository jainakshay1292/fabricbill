// ─────────────────────────────────────────────
// components/CustomerLedger.jsx
// Clean statement-style ledger:
//   - Fixed column widths for perfect alignment
//   - Debit / Credit totals at bottom
//   - Running balance with colour coding
//   - Negative balance = advance/overpaid (blue)
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";

// Fixed column layout — all rows use same widths
const COL = "48px 1fr 68px 68px 72px";

const cell = (align = "left", extra = {}) => ({
  textAlign: align,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  ...extra,
});

export function CustomerLedger({ customer, transactions, settlements, getCustomerOutstanding, settings, onClose }) {
  const f  = (n) => fmt(n, settings.currency);
  // Short date: "28 Mar" — no year to save space, year only if different from current
  const shortDate = (d) => {
    try {
      const dt   = new Date(d);
      const now  = new Date();
      const day  = dt.getDate();
      const mon  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
      const yr   = dt.getFullYear();
      return yr !== now.getFullYear() ? `${day} ${mon} ${yr}` : `${day} ${mon}`;
    } catch { return ""; }
  };
  const f2 = (n) => n === 0 ? "" : fmt(Math.abs(n), settings.currency);

  // ── Build event list ──────────────────────────
  const custTxns = transactions
    .filter((t) => (t.customer?.id === customer.id || t.customerId === customer.id) && !t.void && !t.cancelled)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const custSetts = settlements
    .filter((s) => s.customerId === customer.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const events = [];

  custTxns.forEach((t) => {
    const total    = t.total || 0;
    const payments = t.payments?.length > 0
      ? t.payments
      : [{ mode: t.paymentMode || "Cash", amount: total }];
    const paidNow = payments
      .filter((p) => p.mode !== "Credit")
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const paidModes = payments
      .filter((p) => p.mode !== "Credit" && (parseFloat(p.amount) || 0) > 0)
      .map((p) => p.mode).join("+");

    // Invoice row — debit
    events.push({ date: t.date, type: "invoice", label: t.invoiceNo || "Invoice", debit: total, credit: 0, mode: null });
    // Payment row — credit
    if (paidNow > 0)
      events.push({ date: t.date, type: "payment", label: "Paid", debit: 0, credit: paidNow, mode: paidModes });
  });

  custSetts.forEach((s) => {
    events.push({ date: s.date, type: "settlement", label: "Settlement", debit: 0, credit: s.amount, mode: s.paymentMode });
  });

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Running balance
  let running = 0;
  const rows = events.map((e) => {
    running = running + e.debit - e.credit;
    return { ...e, balance: Math.round(running * 100) / 100 };
  });

  // Totals
  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const outstanding = getCustomerOutstanding(customer.id);

  const balColor = (b) => b > 0 ? "#dc2626" : b < 0 ? "#2563eb" : "#16a34a";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f" }}>📒 {customer.name}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>{customer.phone || "No phone"}</div>

          {/* Balance pill */}
          <div style={{
            background: outstanding > 0 ? "#fee2e2" : outstanding < 0 ? "#eff6ff" : "#f0fdf4",
            border: `1px solid ${outstanding > 0 ? "#fca5a5" : outstanding < 0 ? "#93c5fd" : "#86efac"}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: outstanding > 0 ? "#991b1b" : outstanding < 0 ? "#1e40af" : "#166534" }}>
              {outstanding > 0 ? "⚠ Outstanding" : outstanding < 0 ? "💰 Advance / Overpaid" : "✅ Fully Paid"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: balColor(outstanding) }}>
              {outstanding < 0 ? "-" : ""}{f(Math.abs(outstanding))}
            </span>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: COL, gap: 4, fontSize: 10, fontWeight: 700, color: "#9ca3af", padding: "6px 0", borderBottom: "2px solid #1e3a5f" }}>
            <span style={cell()}>DATE</span>
            <span style={cell()}>PARTICULARS</span>
            <span style={cell("right")}>DEBIT</span>
            <span style={cell("right")}>CREDIT</span>
            <span style={cell("right")}>BAL.</span>
          </div>
        </div>

        {/* ── Scrollable rows ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 16px" }}>
          {rows.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "30px 0" }}>No transactions yet</div>
          )}

          {rows.map((row, i) => {
            const isInv  = row.type === "invoice";
            const isPay  = row.type === "payment" || row.type === "settlement";
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: COL, gap: 4,
                padding: "8px 0", borderBottom: "1px solid #f3f4f6",
                alignItems: "center",
                background: isInv ? "#fafbff" : isPay ? "#f6fef9" : "transparent",
              }}>
                <span style={{ ...cell(), fontSize: 11, color: "#9ca3af" }}>
                  {(() => {
                    try {
                      const d = new Date(row.date);
                      return d.getDate() + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
                    } catch { return ""; }
                  })()}
                </span>

                {/* Particulars + mode badge */}
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: isInv ? 700 : 500, color: "#1e3a5f", wordBreak: "break-all" }}>
                    {row.label}
                  </div>
                  {row.mode && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#e0f2fe", color: "#0369a1", borderRadius: 3, padding: "1px 4px" }}>
                      {row.mode}
                    </span>
                  )}
                </div>

                {/* Debit */}
                <span style={{ ...cell("right"), fontSize: 11, fontWeight: isInv ? 700 : 400, color: isInv ? "#dc2626" : "#d1d5db" }}>
                  {f2(row.debit)}
                </span>

                {/* Credit */}
                <span style={{ ...cell("right"), fontSize: 11, fontWeight: isPay ? 700 : 400, color: isPay ? "#16a34a" : "#d1d5db" }}>
                  {f2(row.credit)}
                </span>

                {/* Running balance */}
                <span style={{ ...cell("right"), fontSize: 11, fontWeight: 800, color: balColor(row.balance) }}>
                  {row.balance < 0 ? "-" : ""}{f(Math.abs(row.balance))}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Totals + Closing Balance ── */}
        {rows.length > 0 && (
          <div style={{ padding: "0 16px", flexShrink: 0, borderTop: "2px solid #1e3a5f" }}>
            {/* Totals row */}
            <div style={{ display: "grid", gridTemplateColumns: COL, gap: 4, padding: "8px 0", borderBottom: "1px solid #e5e7eb", background: "#f8faff" }}>
              <span />
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1e3a5f", whiteSpace: "nowrap" }}>TOTAL</span>
              <span style={{ ...cell("right"), fontSize: 11, fontWeight: 800, color: "#dc2626" }}>{f(totalDebit)}</span>
              <span style={{ ...cell("right"), fontSize: 11, fontWeight: 800, color: "#16a34a" }}>{f(totalCredit)}</span>
              <span />
            </div>
            {/* Closing balance row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1e3a5f" }}>CLOSING BALANCE</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: balColor(outstanding) }}>
                {outstanding < 0 ? "-" : ""}{f(Math.abs(outstanding))}
              </span>
            </div>
          </div>
        )}

        {/* ── Close button ── */}
        <div style={{ padding: "8px 16px 16px", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
