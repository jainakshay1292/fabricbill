

// ─────────────────────────────────────────────
// tabs/HistoryTab.jsx
// Bills list + Sales Report + Credit Report.
// Admin sees all views; Staff sees bills only.
//
// Props:
//   transactions           - all transactions
//   settlements            - all settlements
//   customers              - customer list
//   settings               - shop settings
//   isAdmin                - boolean
//   getCustomerOutstanding - (custId) => number
//   onViewReceipt          - (txn) => void
//   onEditTxn              - (txn) => void
//   onSettle               - (customer) => void
//   onViewVoucher          - (voucher) => void
// ─────────────────────────────────────────────
import { useState } from "react";
import { fmt, fmtDate, fmtDateTime } from "../utils/format";
import { buildGstRows } from "../utils/gst";
import { toCSV, downloadCSV } from "../utils/csv";
import { isWithin24Hours } from "../utils/misc";
import { card, inp, lbl } from "../styles";

export function HistoryTab({
  transactions, settlements, customers, settings, isAdmin,
  getCustomerOutstanding, onViewReceipt, onEditTxn, onSettle, onViewVoucher,
}) {
  const [histView, setHistView]               = useState("bills");
  const [selectedDay, setSelectedDay]         = useState(null);
  const [reportFrom, setReportFrom]           = useState("");
  const [reportTo, setReportTo]               = useState("");
  const [searchQuery, setSearchQuery]         = useState("");
  const [creditReportView, setCreditReportView] = useState(false);
  const f = (n) => fmt(n, settings.currency);

  // ── Helpers ───────────────────────────────────────────────
  const payAmt = (t, mode) =>
    t.void || t.cancelled ? 0 :
    Number(t.payments ? t.payments.find((p) => p.mode === mode)?.amount || 0 : (t.paymentMode === mode ? t.total : 0)) || 0;

  const dayTotals = (txns) => ({
    gross:     txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.subtotal || 0), 0),
    discount:  txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.discount || 0), 0),
    taxable:   txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.taxable || 0), 0),
    gst:       txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.gst || 0), 0),
    net:       txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.total || 0), 0),
    count:     txns.filter((t) => !t.void && !t.cancelled).length,
    voidCount: txns.filter((t) => t.void || t.cancelled).length,
    cash:      txns.reduce((s, t) => s + payAmt(t, "Cash"), 0),
    upi:       txns.reduce((s, t) => s + payAmt(t, "UPI"), 0),
    card:      txns.reduce((s, t) => s + payAmt(t, "Card"), 0),
    credit:    txns.reduce((s, t) => s + payAmt(t, "Credit"), 0),
  });

  // Group transactions by calendar day
  const grouped = {};
  transactions.forEach((txn) => {
    const day = new Date(txn.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(txn);
  });
  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  // Apply date range filter
  const getFilteredDays = () =>
    days.filter((day) => {
      const d = new Date(day);
      if (reportFrom) { const [fy, fm, fd] = reportFrom.split("-").map(Number); if (d < new Date(fy, fm - 1, fd)) return false; }
      if (reportTo)   { const [ty, tm, td] = reportTo.split("-").map(Number);   if (d > new Date(ty, tm - 1, td, 23, 59, 59)) return false; }
      return true;
    });

  const filteredTxns  = getFilteredDays().flatMap((d) => grouped[d] || []);
  const rangeTotals   = dayTotals(filteredTxns);

  // Search filter for bills view
  const filteredBills = transactions.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.customer?.name?.toLowerCase().includes(q) ||
      t.customerName?.toLowerCase().includes(q) ||
      t.invoiceNo?.toLowerCase().includes(q) ||
      (t.customer?.phone || t.customerPhone || "").includes(q)
    );
  });

  // CSV export
  const exportReportCSV = (txns, label) => {
    const cols = [
      { key: "invoiceNo", label: "Invoice No" }, { key: "date", label: "Date" },
      { key: "customer", label: "Customer" },    { key: "phone", label: "Phone" },
      { key: "items", label: "Items" },          { key: "gross", label: "Gross" },
      { key: "discount", label: "Discount" },    { key: "taxable", label: "Taxable" },
      { key: "cgst", label: "CGST" },            { key: "sgst", label: "SGST" },
      { key: "totalGst", label: "Total GST" },   { key: "net", label: "Net Amount" },
      { key: "cash", label: "Cash" },            { key: "upi", label: "UPI" },
      { key: "card", label: "Card" },            { key: "credit", label: "Credit Due" },
      { key: "status", label: "Status" },
    ];
    const rows = txns.map((t) => {
      const gstRows = buildGstRows(t.items || [], t.taxable || 0, t.subtotal || 0);
      const cgst = gstRows.reduce((s, r) => s + r.cgst, 0);
      const sgst = gstRows.reduce((s, r) => s + r.sgst, 0);
      return {
        invoiceNo: t.invoiceNo || "", date: fmtDate(t.date),
        customer:  t.customer?.name || t.customerName || "",
        phone:     t.customer?.phone || t.customerPhone || "",
        items:     (t.items || []).map((i) => `${i.name}×${i.qty}@${i.price}`).join("; "),
        gross:     Number(t.subtotal || 0).toFixed(2),
        discount:  Number(t.discount || 0).toFixed(2),
        taxable:   Number(t.taxable  || 0).toFixed(2),
        cgst:      Number(t.void || t.cancelled ? 0 : cgst).toFixed(2),
        sgst:      Number(t.void || t.cancelled ? 0 : sgst).toFixed(2),
        totalGst:  Number(t.void || t.cancelled ? 0 : t.gst || 0).toFixed(2),
        net:       Number(t.void || t.cancelled ? 0 : t.total || 0).toFixed(2),
        cash:      Number(t.void || t.cancelled ? 0 : payAmt(t, "Cash")).toFixed(2),
        upi:       Number(t.void || t.cancelled ? 0 : payAmt(t, "UPI")).toFixed(2),
        card:      Number(t.void || t.cancelled ? 0 : payAmt(t, "Card")).toFixed(2),
        credit:    Number(t.void || t.cancelled ? 0 : payAmt(t, "Credit")).toFixed(2),
        status:    t.void ? "VOID" : t.cancelled ? "CANCELLED" : "Active",
      };
    });
    downloadCSV(toCSV(rows, cols), `FabricBill-Report-${label}.csv`);
  };

  const exportSettlementsCSV = () => {
    const cols = [
      { key: "voucherNo", label: "Voucher No" }, { key: "date", label: "Date" },
      { key: "customer", label: "Customer" },    { key: "amount", label: "Amount" },
      { key: "mode", label: "Payment Mode" },    { key: "prev", label: "Prev Outstanding" },
      { key: "remaining", label: "Remaining" },
    ];
    const rows = settlements.map((s) => ({
      voucherNo: s.voucherNo, date: fmtDate(s.date), customer: s.customerName,
      amount: Number(s.amount).toFixed(2), mode: s.paymentMode,
      prev: Number(s.prevOutstanding).toFixed(2), remaining: Number(s.remainingOutstanding).toFixed(2),
    }));
    downloadCSV(toCSV(rows, cols), "FabricBill-Settlements.csv");
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <>
      {/* View toggle (Admin only) */}
      {isAdmin && (
        <div style={{ display: "flex", background: "#fff", borderRadius: 10, padding: 4, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
          {[["bills", "📋 Bills"], ["report", "📊 Report"]].map(([k, l]) => (
            <button key={k} onClick={() => { setHistView(k); setSelectedDay(null); setCreditReportView(false); }}
              style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", background: histView === k ? "#1e3a5f" : "transparent", color: histView === k ? "#fff" : "#9ca3af" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── Bills view ── */}
      {(histView === "bills" || !isAdmin) && (
        <div style={card}>
          <div style={{ marginBottom: 12 }}>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search by name, invoice, phone..." style={{ ...inp, fontSize: 13 }} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>📋 Bills ({filteredBills.length})</div>
          {filteredBills.length === 0
            ? <div style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>No bills found</div>
            : filteredBills.map((txn) => {
              const canEdit  = isAdmin && !(txn.void || txn.cancelled) && isWithin24Hours(txn.date);
              const pmtLabel = txn.payments?.length > 1
                ? txn.payments.filter((p) => p.amount > 0).map((p) => p.mode).join("+")
                : (txn.payments?.[0]?.mode || txn.paymentMode);
              const txnCredit = payAmt(txn, "Credit");
              const isVoid    = txn.void || txn.cancelled;
              return (
                <div key={txn.id} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12, marginBottom: 12, opacity: isVoid ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {txn.customer?.name || txn.customerName}
                        {isVoid && <span style={{ color: "#dc2626", fontSize: 11, fontWeight: 800, background: "#fee2e2", padding: "1px 6px", borderRadius: 4, marginLeft: 6 }}>VOID</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{txn.invoiceNo} · {fmtDateTime(txn.date)}</div>
                      {txn.editedAt && <div style={{ fontSize: 10, color: "#f59e0b" }}>✏️ Edited: {fmtDateTime(txn.editedAt)}</div>}
                    </div>
                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: isVoid ? "#9ca3af" : "#16a34a" }}>{isVoid ? "VOID" : f(txn.total || txn.net || 0)}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{pmtLabel}</div>
                      {txnCredit > 0 && !isVoid && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>Due: {f(txnCredit)}</div>}
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => onViewReceipt(txn)} style={{ background: "#eff6ff", border: "none", borderRadius: 6, color: "#2563eb", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>👁 View</button>
                        {canEdit && <button onClick={() => onEditTxn(txn)} style={{ background: "#fef3c7", border: "none", borderRadius: 6, color: "#92400e", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✏️ Edit</button>}
                      </div>
                    </div>
                  </div>
                  {(txn.items || []).map((item, ii) => (
                    <div key={item.uid || ii} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                      <span style={{ color: item.qty < 0 ? "#dc2626" : "inherit" }}>{item.name} × {item.qty} @ {f(item.price)}{item.qty < 0 ? " ↩" : ""}</span>
                      <span style={{ color: (item.gstRate || 0) * 100 >= settings.gstHigh ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{((item.gstRate || 0) * 100).toFixed(0)}% GST</span>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      )}

      {/* ── Sales Report (Admin only) ── */}
      {isAdmin && histView === "report" && !creditReportView && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>📊 Sales Report</div>
            <button onClick={() => setCreditReportView(true)}
              style={{ padding: "6px 12px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📒 Credit Report
            </button>
          </div>

          {/* Date range pickers */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}><div style={{ ...lbl, marginBottom: 4 }}>From</div><input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} /></div>
            <div style={{ flex: 1 }}><div style={{ ...lbl, marginBottom: 4 }}>To</div><input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} /></div>
            <button onClick={() => { setReportFrom(""); setReportTo(""); }} style={{ marginTop: 20, padding: "8px 10px", background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#6b7280", cursor: "pointer" }}>Clear</button>
          </div>

          {/* Quick range presets */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[["Today", 0], ["Yesterday", 1], ["Last 7 Days", 7], ["This Month", -1]].map(([label, d]) => (
              <button key={label} onClick={() => {
                const now = new Date();
                if (d === 0)  { const v = now.toISOString().slice(0, 10); setReportFrom(v); setReportTo(v); }
                if (d === 1)  { const v = new Date(now - 86400000).toISOString().slice(0, 10); setReportFrom(v); setReportTo(v); }
                if (d === 7)  { setReportFrom(new Date(now - 7 * 86400000).toISOString().slice(0, 10)); setReportTo(now.toISOString().slice(0, 10)); }
                if (d === -1) { setReportFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)); setReportTo(now.toISOString().slice(0, 10)); }
              }} style={{ padding: "5px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#1e40af", cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>

          {filteredTxns.length > 0 && (
            <>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  ["💰 Net Collection", f(rangeTotals.net), "#16a34a", "#f0fdf4"],
                  ["🧾 Bills", rangeTotals.count + " active" + (rangeTotals.voidCount > 0 ? " · " + rangeTotals.voidCount + " void" : ""), "#1e3a5f", "#eff6ff"],
                  ["📋 Taxable", f(rangeTotals.taxable), "#7c3aed", "#faf5ff"],
                  ["🏛 GST", f(rangeTotals.gst), "#dc2626", "#fff1f2"],
                ].map(([label, val, color, bg]) => (
                  <div key={label} style={{ background: bg, borderRadius: 12, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontWeight: 800, fontSize: 16, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Payment breakdown */}
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 10 }}>💳 Payment Breakdown</div>
                {[["💵 Cash", rangeTotals.cash, "#16a34a"], ["📱 UPI", rangeTotals.upi, "#2563eb"], ["💳 Card", rangeTotals.card, "#7c3aed"], ["📒 Credit (Due)", rangeTotals.credit, "#dc2626"]].map(([label, val, color]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color }}>{f(val)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 2, borderTop: "2px solid #e5e7eb" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>Collected (excl. credit)</span>
                  <span style={{ fontWeight: 900, fontSize: 15, color: "#1e3a5f" }}>{f(rangeTotals.cash + rangeTotals.upi + rangeTotals.card)}</span>
                </div>
              </div>

              {/* GST summary */}
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>🏛 GST Summary</div>
                {[
                  ["Gross Total", f(rangeTotals.gross)],
                  ["Less Discount", f(rangeTotals.discount)],
                  ["Taxable Value", f(rangeTotals.taxable)],
                  ["CGST (Half)", f(rangeTotals.gst / 2)],
                  ["SGST (Half)", f(rangeTotals.gst / 2)],
                  ["IGST", f(0)],
                  ["Total GST", f(rangeTotals.gst)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ color: "#6b7280" }}>{l}</span>
                    <span style={{ fontWeight: l === "Total GST" || l === "Taxable Value" ? 800 : 600, color: l === "Total GST" ? "#dc2626" : l === "Taxable Value" ? "#7c3aed" : "#111" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Export buttons */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={() => exportReportCSV(filteredTxns, (reportFrom || "all") + "_to_" + (reportTo || "all"))}
                  style={{ flex: 1, padding: "11px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Export CSV</button>
                <button onClick={() => exportReportCSV(transactions, "ALL")}
                  style={{ flex: 1, padding: "11px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Export All</button>
              </div>
            </>
          )}

          {/* Day-wise breakdown */}
          {!selectedDay ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>📅 Day-wise</div>
              {getFilteredDays().length === 0
                ? <div style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>No transactions in this range</div>
                : getFilteredDays().map((day, i) => {
                  const t = dayTotals(grouped[day]);
                  return (
                    <div key={day} onClick={() => setSelectedDay(day)} className="day-row"
                      style={{ borderBottom: i < getFilteredDays().length - 1 ? "1px solid #f3f4f6" : "none", padding: "12px 8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{day}</div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "#16a34a" }}>{f(t.net)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#9ca3af" }}>
                        <span>{t.count} bill{t.count !== 1 ? "s" : ""}{t.voidCount > 0 ? " · " + t.voidCount + " void" : ""}</span>
                        {t.cash > 0 && <span>💵 {f(t.cash)}</span>}
                        {t.upi  > 0 && <span>📱 {f(t.upi)}</span>}
                        {t.card > 0 && <span>💳 {f(t.card)}</span>}
                        {t.credit > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}>Due: {f(t.credit)}</span>}
                      </div>
                    </div>
                  );
                })}
            </>
          ) : (() => {
            const t = dayTotals(grouped[selectedDay]);
            return (
              <div>
                <button onClick={() => setSelectedDay(null)} style={{ background: "#eff6ff", border: "none", borderRadius: 8, padding: "8px 14px", color: "#1e3a5f", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>← Back to days</button>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 2 }}>{selectedDay}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{t.count} active · {t.voidCount} void</div>
                {[["Gross Total", f(t.gross)], ["Less Discount", f(t.discount)], ["Taxable", f(t.taxable)], ["CGST", f(t.gst / 2)], ["SGST", f(t.gst / 2)], ["IGST", f(0)], ["Total GST", f(t.gst)], ["Net Collection", f(t.net)]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ color: "#6b7280" }}>{l}</span>
                    <span style={{ fontWeight: l === "Net Collection" ? 900 : 600, color: l === "Net Collection" ? "#16a34a" : "#111", fontSize: l === "Net Collection" ? 17 : 14 }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 700, fontSize: 13, color: "#1e3a5f" }}>Payment Breakup</div>
                {[["💵 Cash", t.cash, "#16a34a"], ["📱 UPI", t.upi, "#2563eb"], ["💳 Card", t.card, "#7c3aed"], ["📒 Credit (Due)", t.credit, "#dc2626"]].map(([m, v, c]) => (
                  <div key={m} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ color: "#6b7280" }}>{m}</span><span style={{ fontWeight: 700, color: c }}>{f(v)}</span>
                  </div>
                ))}
                <button onClick={() => exportReportCSV(grouped[selectedDay], selectedDay)}
                  style={{ width: "100%", marginTop: 14, padding: "11px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  📥 Export This Day CSV
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Credit Report (Admin only) ── */}
      {isAdmin && histView === "report" && creditReportView && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setCreditReportView(false)} style={{ background: "#eff6ff", border: "none", borderRadius: 8, padding: "8px 12px", color: "#1e3a5f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Back</button>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>📒 Credit Report</div>
          </div>

          {/* Customers with outstanding */}
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#dc2626", marginBottom: 10 }}>⚠ Customers with Outstanding</div>
            {customers.filter((c) => c.id !== "c1" && getCustomerOutstanding(c.id) > 0).length === 0
              ? <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No outstanding credit 🎉</div>
              : customers.filter((c) => c.id !== "c1" && getCustomerOutstanding(c.id) > 0).map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.phone || "No phone"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 900, fontSize: 15, color: "#dc2626" }}>{f(getCustomerOutstanding(c.id))}</div>
                    <button onClick={() => onSettle(c)} style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Settle</button>
                  </div>
                </div>
              ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 4, borderTop: "2px solid #e5e7eb" }}>
              <span style={{ fontWeight: 700, color: "#1e3a5f" }}>Total Outstanding</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: "#dc2626" }}>{f(customers.filter((c) => c.id !== "c1").reduce((s, c) => s + getCustomerOutstanding(c.id), 0))}</span>
            </div>
          </div>

          {/* Settlement history */}
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 10 }}>📄 Settlement History</div>
            {settlements.length === 0
              ? <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No settlements yet</div>
              : settlements.map((s) => (
                <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{s.customerName}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.voucherNo} · {fmtDate(s.date)}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{s.paymentMode}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#16a34a" }}>{f(s.amount)}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>Remaining: {f(s.remainingOutstanding)}</div>
                      <button onClick={() => onViewVoucher(s)} style={{ padding: "3px 8px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", marginTop: 2 }}>👁 View</button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
          <button onClick={exportSettlementsCSV}
            style={{ width: "100%", padding: "11px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            📥 Export Settlements CSV
          </button>
        </div>
      )}
    </>
  );
}

