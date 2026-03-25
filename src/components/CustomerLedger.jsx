// ─────────────────────────────────────────────
// components/CustomerLedger.jsx
// Statement-style ledger with running balance.
// Each invoice shows full amount, then each
// payment (cash/credit/UPI) as a receipt row,
// with balance updating after every line.
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";

export function CustomerLedger({ customer, transactions, settlements, getCustomerOutstanding, settings, onClose }) {
  const f = (n) => fmt(n, settings.currency);

  // ── Collect all events chronologically ───────
  const custTxns = transactions
    .filter((t) => (t.customer?.id === customer.id || t.customerId === customer.id) && !t.void && !t.cancelled)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const custSetts = settlements
    .filter((s) => s.customerId === customer.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Build flat event list:
  //   - Each invoice = one DEBIT row (full invoice amount)
  //   - Each non-credit payment on an invoice = one CREDIT row (paid now)
  //   - Each credit portion = tracked as still owed (no credit row yet)
  //   - Each settlement = one CREDIT row
  const events = [];

  custTxns.forEach((t) => {
    const total    = t.total || 0;
    const payments = t.payments && t.payments.length > 0
      ? t.payments
      : [{ mode: t.paymentMode || "Cash", amount: total }];

    const creditAmt = payments
      .filter((p) => p.mode === "Credit")
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

    const paidNow = payments
      .filter((p) => p.mode !== "Credit")
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

    // 1. Invoice raised — debit full amount
    events.push({
      date:    t.date,
      type:    "invoice",
      label:   `Invoice ${t.invoiceNo}`,
      debit:   total,
      credit:  0,
      mode:    null,
      txnId:   t.id,
    });

    // 2. Amount paid at time of billing (non-credit portion)
    if (paidNow > 0) {
      const paidModes = payments
        .filter((p) => p.mode !== "Credit" && (parseFloat(p.amount) || 0) > 0)
        .map((p) => p.mode)
        .join(" + ");
      events.push({
        date:    t.date,
        type:    "payment",
        label:   `Payment received`,
        debit:   0,
        credit:  paidNow,
        mode:    paidModes,
        txnId:   t.id,
      });
    }
  });

  // 3. Settlements (later payments against credit)
  custSetts.forEach((s) => {
    events.push({
      date:   s.date,
      type:   "settlement",
      label:  `Payment received`,
      debit:  0,
      credit: s.amount,
      mode:   s.paymentMode,
      txnId:  s.id,
    });
  });

  // Sort everything chronologically
  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Compute running balance after each row
  let running = 0;
  const rows = events.map((e) => {
    running = running + e.debit - e.credit;
    return { ...e, balance: running };
  });

  const outstanding = getCustomerOutstanding(customer.id);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f" }}>📒 {customer.name}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>{customer.phone || "No phone"}</div>

          {/* Outstanding summary pill */}
          <div style={{
            background: outstanding > 0 ? "#fee2e2" : "#f0fdf4",
            border: `1px solid ${outstanding > 0 ? "#fca5a5" : "#86efac"}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: outstanding > 0 ? "#991b1b" : "#166534" }}>
              {outstanding > 0 ? "⚠ Outstanding Balance" : "✅ Fully Paid"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: outstanding > 0 ? "#dc2626" : "#16a34a" }}>
              {f(outstanding)}
            </span>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "68px 1fr 72px 72px 80px", gap: 4, fontSize: 10, fontWeight: 700, color: "#9ca3af", padding: "6px 0", borderBottom: "2px solid #e5e7eb" }}>
            <span>DATE</span>
            <span>PARTICULARS</span>
            <span style={{ textAlign: "right" }}>DEBIT</span>
            <span style={{ textAlign: "right" }}>CREDIT</span>
            <span style={{ textAlign: "right" }}>BALANCE</span>
          </div>
        </div>

        {/* ── Scrollable rows ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 16px" }}>
          {rows.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
              No transactions yet
            </div>
          )}

          {rows.map((row, i) => {
            const isInvoice    = row.type === "invoice";
            const isPayment    = row.type === "payment" || row.type === "settlement";
            const balanceColor = row.balance > 0 ? "#dc2626" : row.balance === 0 ? "#16a34a" : "#1e3a5f";

            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "68px 1fr 72px 72px 80px",
                gap: 4,
                padding: "9px 0",
                borderBottom: "1px solid #f3f4f6",
                alignItems: "center",
                background: isInvoice ? "#f8faff" : isPayment ? "#f0fdf4" : "transparent",
              }}>

                {/* Date */}
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtDate(row.date)}</span>

                {/* Particulars */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: isInvoice ? 700 : 500, color: "#1e3a5f" }}>
                    {row.label}
                  </div>
                  {row.mode && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: "#e0f2fe", color: "#0369a1",
                      borderRadius: 4, padding: "1px 5px",
                      display: "inline-block", marginTop: 2,
                    }}>
                      {row.mode}
                    </span>
                  )}
                </div>

                {/* Debit */}
                <span style={{ textAlign: "right", fontSize: 13, fontWeight: isInvoice ? 700 : 400, color: isInvoice ? "#dc2626" : "#9ca3af" }}>
                  {row.debit > 0 ? f(row.debit) : ""}
                </span>

                {/* Credit */}
                <span style={{ textAlign: "right", fontSize: 13, fontWeight: isPayment ? 700 : 400, color: isPayment ? "#16a34a" : "#9ca3af" }}>
                  {row.credit > 0 ? f(row.credit) : ""}
                </span>

                {/* Running balance */}
                <span style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: balanceColor }}>
                  {f(row.balance)}
                </span>
              </div>
            );
          })}

          {/* Final balance row */}
          {rows.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "68px 1fr 72px 72px 80px", gap: 4,
              padding: "10px 0", borderTop: "2px solid #e5e7eb", marginTop: 2,
            }}>
              <span />
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1e3a5f" }}>Closing Balance</span>
              <span />
              <span />
              <span style={{ textAlign: "right", fontSize: 14, fontWeight: 900, color: outstanding > 0 ? "#dc2626" : "#16a34a" }}>
                {f(outstanding)}
              </span>
            </div>
          )}
        </div>

        {/* ── Close button ── */}
        <div style={{ padding: 16 }}>
          <button
            onClick={onClose}
            style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
