// ─────────────────────────────────────────────
// components/CustomerLedger.jsx
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";

export function CustomerLedger({ customer, transactions, settlements, getCustomerOutstanding, settings, onClose }) {
  const f = (n) => fmt(n, settings.currency);

  const custTxns  = transactions
    .filter((t) => (t.customer?.id === customer.id || t.customerId === customer.id) && !t.void && !t.cancelled)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const custSetts = settlements
    .filter((s) => s.customerId === customer.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // For each bill, expand into one row per payment mode so partial payments
  // (e.g. ₹500 Cash + ₹300 Credit on a ₹800 bill) are clearly visible.
  const billEntries = custTxns.flatMap((t) => {
    const payments = t.payments && t.payments.length > 0
      ? t.payments
      : [{ mode: t.paymentMode || "Cash", amount: t.total || 0 }];

    return payments
      .filter((p) => (parseFloat(p.amount) || 0) > 0)
      .map((p, idx) => ({
        date:        t.date,
        type:        "bill",
        label:       t.invoiceNo,
        subLabel:    payments.length > 1 ? `${p.mode}` : p.mode,
        isFirstRow:  idx === 0,
        debit:       parseFloat(p.amount) || 0,
        credit:      0,
        isCreditMode: p.mode === "Credit",
      }));
  });

  const settleEntries = custSetts.map((s) => ({
    date:         s.date,
    type:         "settlement",
    label:        s.voucherNo,
    subLabel:     s.paymentMode,
    isFirstRow:   true,
    debit:        0,
    credit:       s.amount,
    isCreditMode: false,
  }));

  const entries = [...billEntries, ...settleEntries]
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 2 }}>📒 Ledger — {customer.name}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{customer.phone || "No phone"}</div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "72px 1fr 80px 80px", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", padding: "6px 0", borderBottom: "2px solid #e5e7eb", marginBottom: 4 }}>
          <span>Date</span>
          <span>Details</span>
          <span style={{ textAlign: "right" }}>Billed</span>
          <span style={{ textAlign: "right" }}>Settled</span>
        </div>

        {entries.map((e, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "72px 1fr 80px 80px", gap: 4,
            fontSize: 12, padding: "6px 0",
            borderBottom: "1px solid #f3f4f6",
            background: e.type === "settlement" ? "#f0fdf4" : e.isCreditMode ? "#fff7ed" : "transparent",
          }}>
            {/* Date — only on first row of a bill to avoid repetition */}
            <span style={{ color: "#9ca3af", fontSize: 11 }}>
              {e.isFirstRow ? fmtDate(e.date) : ""}
            </span>

            {/* Label + payment mode badge */}
            <span style={{ fontWeight: 600 }}>
              {e.isFirstRow && <span style={{ display: "block" }}>{e.label}</span>}
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: e.isCreditMode ? "#fee2e2" : e.type === "settlement" ? "#dcfce7" : "#f3f4f6",
                color:      e.isCreditMode ? "#dc2626" : e.type === "settlement" ? "#16a34a" : "#6b7280",
                borderRadius: 4, padding: "1px 5px", display: "inline-block"
              }}>
                {e.subLabel}
              </span>
            </span>

            {/* Billed amount */}
            <span style={{ textAlign: "right", color: e.isCreditMode ? "#dc2626" : "#374151", fontWeight: e.debit > 0 ? 700 : 400 }}>
              {e.debit > 0 ? f(e.debit) : "-"}
            </span>

            {/* Settled amount */}
            <span style={{ textAlign: "right", color: "#16a34a", fontWeight: e.credit > 0 ? 700 : 400 }}>
              {e.credit > 0 ? f(e.credit) : "-"}
            </span>
          </div>
        ))}

        {/* Outstanding balance footer */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #e5e7eb", marginTop: 4, fontWeight: 800, fontSize: 15 }}>
          <span>Outstanding Balance</span>
          <span style={{ color: getCustomerOutstanding(customer.id) > 0 ? "#dc2626" : "#16a34a" }}>
            {f(getCustomerOutstanding(customer.id))}
          </span>
        </div>

        <button onClick={onClose}
          style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>
          Close
        </button>
      </div>
    </div>
  );
}
