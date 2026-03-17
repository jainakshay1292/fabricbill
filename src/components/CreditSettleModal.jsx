// ═════════════════════════════════════════════
// Copy each section into its own file as named
// ═════════════════════════════════════════════


// ─────────────────────────────────────────────
// components/CreditSettleModal.jsx
// Modal to collect a payment against a credit
// outstanding balance.
//
// Props:
//   customer    - customer object { id, name, phone }
//   outstanding - current outstanding amount (number)
//   settings    - shop settings
//   onConfirm   - (amount, mode) => void
//   onCancel    - () => void
// ─────────────────────────────────────────────
import { useState } from "react";
import { fmt } from "../utils/format";
import { inp, lbl } from "../styles";

export function CreditSettleModal({ customer, outstanding, settings, onConfirm, onCancel }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode]     = useState("Cash");
  const f = (n) => fmt(n, settings.currency);

  const handleConfirm = () => {
    const amt = parseFloat(String(amount).trim());
    if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
    if (amt > outstanding + 0.01) return alert("Amount cannot exceed outstanding " + f(outstanding));
    onConfirm(amt, mode);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 4 }}>💳 Settle Credit</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Customer: <b>{customer.name}</b></div>
        <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 700 }}>Outstanding</span>
          <span style={{ fontSize: 15, color: "#dc2626", fontWeight: 900 }}>{f(outstanding)}</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Amount Received (₹)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder={String(outstanding)} style={inp} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Payment Mode</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["Cash", "UPI", "Card"].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", background: mode === m ? "#1e3a5f" : "#f3f4f6", color: mode === m ? "#fff" : "#374151" }}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleConfirm}
          style={{ width: "100%", padding: "13px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>
          ✅ Confirm Settlement
        </button>
        <button onClick={onCancel}
          style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// components/ReceiptVoucher.jsx
// Shows a printable receipt after a credit
// settlement is recorded.
//
// Props:
//   voucher  - settlement voucher object
//   settings - shop settings
//   onClose  - () => void
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";
import { BDR } from "../styles";

export function ReceiptVoucher({ voucher, settings, onClose }) {
  const f = (n) => fmt(n, settings.currency);

  const doWhatsApp = () => {
    const msg = `🧵 *${settings.shopName}*\n─────────────────────\n📄 *RECEIPT VOUCHER: ${voucher.voucherNo}*\n📅 Date: ${fmtDate(voucher.date)}\n👤 Customer: *${voucher.customerName}*\n─────────────────────\n💰 Amount Received: *${f(voucher.amount)}*\n💳 Mode: ${voucher.paymentMode}\n📋 Previous Outstanding: ${f(voucher.prevOutstanding)}\n✅ Remaining Outstanding: ${f(voucher.remainingOutstanding)}\n─────────────────────\n*${settings.signoff}*`;
    const phone = voucher.customerPhone || "";
    window.open((phone ? `https://wa.me/91${phone}` : "https://wa.me/") + "?text=" + encodeURIComponent(msg), "_blank");
  };

  const doPrint = () => {
    const el  = document.getElementById("rv-print");
    const win = window.open("", "_blank");
    if (!win || !el) return;
    win.document.write(`<html><head><title>Receipt ${voucher.voucherNo}</title><style>body{font-family:monospace;margin:20px;}</style></head><body>${el.innerHTML}<br/><button onclick="window.print();window.close();">Print</button></body></html>`);
    win.document.close();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div id="rv-print" style={{ border: "2px solid #000", padding: 12, fontFamily: "monospace", fontSize: 11 }}>
          <div style={{ textAlign: "center", borderBottom: BDR, paddingBottom: 6, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 6 }}>{settings.shopName}</div>
            {settings.shopAddress && <div style={{ fontSize: 10 }}>{settings.shopAddress}</div>}
            {settings.gstin && <div style={{ fontSize: 10 }}>GSTIN: {settings.gstin}</div>}
            <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>RECEIPT VOUCHER</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span><b>Voucher No:</b> {voucher.voucherNo}</span>
            <span><b>Date:</b> {fmtDate(voucher.date)}</span>
          </div>
          <div style={{ marginBottom: 8 }}><b>Received From:</b> {voucher.customerName}</div>
          <div style={{ borderTop: BDR, borderBottom: BDR, padding: "8px 0", marginBottom: 8 }}>
            {[
              ["Amount Received",      f(voucher.amount),                 true],
              ["Payment Mode",         voucher.paymentMode,               false],
              ["Previous Outstanding", f(voucher.prevOutstanding),        false],
            ].map(([l, v, bold]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>{l}</span><span style={{ fontWeight: bold ? 800 : 400 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
              <span>Remaining Outstanding</span>
              <span style={{ color: voucher.remainingOutstanding > 0 ? "#dc2626" : "#16a34a" }}>{f(voucher.remainingOutstanding)}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 8 }}>
            <span>{settings.footerNote}</span>
            <span style={{ textAlign: "right" }}>
              <div style={{ marginBottom: 20 }}><b>{settings.signoff}</b></div>
              <div>Authorised Signatory</div>
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 14 }}>
          {[["🖨️","Print","#16a34a",doPrint],["💬","WA","#25d366",doWhatsApp],["✖","Close","#1e3a5f",onClose]].map(([icon,label,bg,fn]) => (
            <button key={label} onClick={fn}
              style={{ padding: "11px 0", background: bg, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 16 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// components/EditInvoiceModal.jsx
// Admin-only modal to edit an invoice within
// 24 hours of creation, or void it entirely.
//
// Props:
//   txn           - original transaction object
//   products      - product list (for datalist)
//   settings      - shop settings
//   onSave        - (updatedTxn) => void
//   onCancel      - () => void
//   onVoidInvoice - () => void
// ─────────────────────────────────────────────
import { useState } from "react";
import { fmt } from "../utils/format";
import { getItemGstRate } from "../utils/gst";
import { genId } from "../utils/misc";
import { PAYMENT_MODES } from "../constants";
import { inp, lbl } from "../styles";

export function EditInvoiceModal({ txn, products, settings, onSave, onCancel, onVoidInvoice }) {
  const [items, setItems]       = useState(txn.items.map((i) => ({ ...i })));
  const [payments, setPayments] = useState(txn.payments || [{ mode: txn.paymentMode || "Cash", amount: txn.total || txn.net || 0 }]);
  const [discount, setDiscount] = useState(txn.discount || 0);
  const f = (n) => fmt(n, settings.currency);

  const usedModes         = payments.map((p) => p.mode);
  const availableModesFor = (cur) => PAYMENT_MODES.filter((m) => m === cur || !usedModes.includes(m));

  // Recalculate totals from current items
  const grandSubtotal = items.reduce((s, i) => (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0) + s, 0);
  const grossTaxable  = Math.round(Math.max(0, grandSubtotal - discount) * 100) / 100;
  const blendedRate   = grandSubtotal > 0
    ? items.reduce((s, i) => {
        const p = parseFloat(i.price) || 0, q = parseFloat(i.qty) || 0, sub = p * q;
        const itemDisc = grandSubtotal > 0 ? (sub / grandSubtotal) * discount : 0;
        return s + (sub / grandSubtotal) * getItemGstRate(i.name, sub - itemDisc, products, settings);
      }, 0)
    : 0;
  const taxable   = Math.round(grossTaxable / (1 + blendedRate) * 100) / 100;
  const gst       = Math.round(grossTaxable * blendedRate / (1 + blendedRate) * 100) / 100;
  const netAmount = Math.round(grossTaxable);

  const totalPaid        = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const paymentMismatch  = payments.length > 1 && Math.abs(totalPaid - netAmount) > 1 && totalPaid > 0;

  // Item helpers
  const updateItem = (uid, field, v) => setItems((p) => p.map((i) => i.uid === uid ? { ...i, [field]: v } : i));
  const removeItem = (uid) => setItems((p) => p.filter((i) => i.uid !== uid));
  const addItem    = () => setItems((p) => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);

  // Payment helpers
  const updatePayment = (idx, field, v) => setPayments((p) => p.map((pm, i) => i === idx ? { ...pm, [field]: v } : pm));
  const addPayment    = () => {
    const remaining = PAYMENT_MODES.filter((m) => !payments.map((p) => p.mode).includes(m));
    if (!remaining.length) return;
    setPayments((p) => [...p, { mode: remaining[0], amount: 0 }]);
  };
  const removePayment = (idx) => setPayments((p) => p.filter((_, i) => i !== idx));

  const handleSave = () => {
    const validItems = items
      .filter((i) => i.name && parseFloat(i.price) !== 0 && parseFloat(i.qty) !== 0)
      .map((i) => {
        const p = parseFloat(i.price), q = parseFloat(i.qty), sub = p * q;
        const itemDisc = grandSubtotal > 0 ? (sub / grandSubtotal) * discount : 0;
        const rate = getItemGstRate(i.name, sub - itemDisc, products, settings);
        return { ...i, price: p, qty: q, subtotal: sub, gstRate: rate, total: sub * (1 + rate) };
      });
    if (!validItems.length) { alert("Add at least one item."); return; }
    const finalPay = payments.map((p, i) =>
      i === 0 && payments.length === 1 && !p.amount ? { ...p, amount: netAmount } : { ...p, amount: parseFloat(p.amount) || 0 }
    );
    if (finalPay.length > 1 && Math.abs(finalPay.reduce((s, p) => s + p.amount, 0) - netAmount) > 1) {
      alert("Payment total doesn't match net amount."); return;
    }
    onSave({ ...txn, items: validItems, subtotal: grandSubtotal, discount: Math.min(discount, grandSubtotal), taxable, gst, roundOff: 0, total: netAmount, payments: finalPay, paymentMode: finalPay[0]?.mode || "Cash", editedAt: new Date().toISOString() });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 2 }}>✏️ Edit Invoice {txn.invoiceNo}</div>
        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 14, fontWeight: 600 }}>⏰ Editable within 24 hours of creation</div>

        {items.map((item) => (
          <div key={item.uid} style={{ background: "#f9fafb", borderRadius: 10, padding: 10, marginBottom: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input list="edit-prod-list" value={item.name} onChange={(e) => updateItem(item.uid, "name", e.target.value)} placeholder="Item name" style={{ ...inp, fontSize: 13 }} />
              <button onClick={() => removeItem(item.uid)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
              <datalist id="edit-prod-list">{products.map((pr) => <option key={pr.id} value={pr.name} />)}</datalist>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><div style={{ ...lbl, fontSize: 10 }}>Price</div><input type="number" value={item.price} onChange={(e) => updateItem(item.uid, "price", e.target.value)} style={{ ...inp, padding: "8px 10px" }} /></div>
              <div style={{ flex: 1 }}><div style={{ ...lbl, fontSize: 10 }}>Qty (negative = return)</div><input type="number" value={item.qty} onChange={(e) => updateItem(item.uid, "qty", e.target.value)} style={{ ...inp, padding: "8px 10px" }} /></div>
            </div>
          </div>
        ))}

        <button onClick={addItem} style={{ width: "100%", padding: "9px 0", background: "#eff6ff", color: "#1e3a5f", border: "2px dashed #93c5fd", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>+ Add Item</button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>Discount (₹)</span>
          <input type="number" min={0} value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            style={{ width: 90, textAlign: "right", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 8px", fontSize: 14 }} />
        </div>

        <div style={{ background: "#eff6ff", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6b7280" }}>Taxable</span><span style={{ fontWeight: 700 }}>{f(taxable)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6b7280" }}>GST</span><span style={{ fontWeight: 700 }}>{f(gst)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #bfdbfe", paddingTop: 8, marginTop: 4, fontWeight: 800, fontSize: 15 }}><span>Net</span><span>{f(netAmount)}</span></div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>💳 Payment</div>
        {payments.map((pm, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <select value={pm.mode} onChange={(e) => updatePayment(idx, "mode", e.target.value)}
              style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              {availableModesFor(pm.mode).map((m) => <option key={m}>{m}</option>)}
            </select>
            <input type="number" value={pm.amount} onChange={(e) => updatePayment(idx, "amount", parseFloat(e.target.value) || 0)}
              placeholder={idx === 0 && payments.length === 1 ? String(netAmount) : "Amount"}
              style={{ width: 100, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
            {payments.length > 1 && <button onClick={() => removePayment(idx)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer" }}>✕</button>}
          </div>
        ))}
        {payments.length < PAYMENT_MODES.length && (
          <button onClick={addPayment} style={{ width: "100%", padding: "8px 0", background: "#f3f4f6", color: "#374151", border: "1px dashed #d1d5db", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>+ Add Payment Mode</button>
        )}
        {paymentMismatch && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ Paid {f(totalPaid)} ≠ Net {f(netAmount)}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={handleSave} style={{ flex: 2, padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>💾 Save Changes</button>
          <button onClick={onCancel} style={{ flex: 1, padding: "13px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
        </div>
        <button onClick={() => { if (window.confirm("Mark as VOID? Invoice kept in records but amounts zeroed.")) onVoidInvoice(); }}
          style={{ width: "100%", marginTop: 8, padding: "11px 0", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          🚫 Void Invoice
        </button>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// components/CustomerLedger.jsx
// Shows a customer's full billing + settlement
// history with a running outstanding balance.
//
// Props:
//   customer               - customer object
//   transactions           - all transactions
//   settlements            - all settlements
//   getCustomerOutstanding - (custId) => number
//   settings               - shop settings
//   onClose                - () => void
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";

export function CustomerLedger({ customer, transactions, settlements, getCustomerOutstanding, settings, onClose }) {
  const f = (n) => fmt(n, settings.currency);

  // Helper: get credit portion of a transaction
  const payAmt = (t, mode) =>
    t.void || t.cancelled ? 0 :
    Number(t.payments ? t.payments.find((p) => p.mode === mode)?.amount || 0 : (t.paymentMode === mode ? t.total : 0)) || 0;

  // Merge invoice + settlement rows and sort chronologically
  const custTxns  = transactions.filter((t) => (t.customer?.id === customer.id || t.customerId === customer.id) && !t.void && !t.cancelled).sort((a, b) => new Date(a.date) - new Date(b.date));
  const custSetts = settlements.filter((s) => s.customerId === customer.id).sort((a, b) => new Date(a.date) - new Date(b.date));
  const entries   = [
    ...custTxns.map((t)  => ({ date: t.date, type: "bill",       label: t.invoiceNo,  debit: t.total || 0, credit: 0,        paymentMode: t.paymentMode })),
    ...custSetts.map((s) => ({ date: s.date, type: "settlement", label: s.voucherNo,  debit: 0,            credit: s.amount, paymentMode: s.paymentMode })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 2 }}>📒 Ledger — {customer.name}</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{customer.phone || "No phone"}</div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", padding: "6px 0", borderBottom: "2px solid #e5e7eb", marginBottom: 4 }}>
          <span>Date</span><span>Details</span><span style={{ textAlign: "right" }}>Billed</span><span style={{ textAlign: "right" }}>Settled</span>
        </div>

        {/* Ledger rows */}
        {entries.map((e, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6", background: e.type === "settlement" ? "#f0fdf4" : "transparent" }}>
            <span style={{ color: "#9ca3af" }}>{fmtDate(e.date)}</span>
            <span style={{ fontWeight: 600 }}>{e.label}<br /><span style={{ fontSize: 10, color: "#9ca3af" }}>{e.paymentMode}</span></span>
            <span style={{ textAlign: "right", color: "#dc2626", fontWeight: e.debit > 0 ? 700 : 400 }}>{e.debit > 0 ? f(e.debit) : "-"}</span>
            <span style={{ textAlign: "right", color: "#16a34a", fontWeight: e.credit > 0 ? 700 : 400 }}>{e.credit > 0 ? f(e.credit) : "-"}</span>
          </div>
        ))}

        {/* Outstanding balance */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #e5e7eb", marginTop: 4, fontWeight: 800, fontSize: 15 }}>
          <span>Outstanding Balance</span>
          <span style={{ color: getCustomerOutstanding(customer.id) > 0 ? "#dc2626" : "#16a34a" }}>
            {f(getCustomerOutstanding(customer.id))}
          </span>
        </div>

        <button onClick={onClose} style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}
