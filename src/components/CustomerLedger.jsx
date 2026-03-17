// ─────────────────────────────────────────────
// components/CustomerLedger.jsx
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";

export function CustomerLedger({ customer, transactions, settlements, getCustomerOutstanding, settings, onClose }) {
  const f = (n) => fmt(n, settings.currency);

  const payAmt = (t, mode) =>
    t.void || t.cancelled ? 0 :
    Number(t.payments ? t.payments.find((p) => p.mode === mode)?.amount || 0 : (t.paymentMode === mode ? t.total : 0)) || 0;

  const custTxns  = transactions
    .filter((t) => (t.customer?.id === customer.id || t.customerId === customer.id) && !t.void && !t.cancelled)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const custSetts = settlements
    .filter((s) => s.customerId === customer.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const entries = [
    ...custTxns.map((t)  => ({ date: t.date, type: "bill",       label: t.invoiceNo,  debit: t.total || 0, credit: 0,        paymentMode: t.paymentMode })),
    ...custSetts.map((s) => ({ date: s.date, type: "settlement", label: s.voucherNo,  debit: 0,            credit: s.amount, paymentMode: s.paymentMode })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 2 }}>📒 Ledger — {customer.name}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{customer.phone || "No phone"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", padding: "6px 0", borderBottom: "2px solid #e5e7eb", marginBottom: 4 }}>
          <span>Date</span><span>Details</span>
          <span style={{ textAlign: "right" }}>Billed</span>
          <span style={{ textAlign: "right" }}>Settled</span>
        </div>

        {entries.map((e, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6", background: e.type === "settlement" ? "#f0fdf4" : "transparent" }}>
            <span style={{ color: "#9ca3af" }}>{fmtDate(e.date)}</span>
            <span style={{ fontWeight: 600 }}>{e.label}<br /><span style={{ fontSize: 10, color: "#9ca3af" }}>{e.paymentMode}</span></span>
            <span style={{ textAlign: "right", color: "#dc2626", fontWeight: e.debit > 0 ? 700 : 400 }}>{e.debit > 0 ? f(e.debit) : "-"}</span>
            <span style={{ textAlign: "right", color: "#16a34a", fontWeight: e.credit > 0 ? 700 : 400 }}>{e.credit > 0 ? f(e.credit) : "-"}</span>
          </div>
        ))}

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
