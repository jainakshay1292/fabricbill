// ─────────────────────────────────────────────
// components/EditInvoiceModal.jsx
// Admin-only modal to edit an invoice within
// 24 hours of creation, or void it entirely.
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

  const totalPaid       = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const paymentMismatch = payments.length > 1 && Math.abs(totalPaid - netAmount) > 1 && totalPaid > 0;

  const updateItem = (uid, field, v) => setItems((p) => p.map((i) => i.uid === uid ? { ...i, [field]: v } : i));
  const removeItem = (uid) => setItems((p) => p.filter((i) => i.uid !== uid));
  const addItem    = () => setItems((p) => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);

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
      i === 0 && payments.length === 1 && !p.amount
        ? { ...p, amount: netAmount }
        : { ...p, amount: parseFloat(p.amount) || 0 }
    );
    if (finalPay.length > 1 && Math.abs(finalPay.reduce((s, p) => s + p.amount, 0) - netAmount) > 1) {
      alert("Payment total doesn't match net amount."); return;
    }
    onSave({
      ...txn, items: validItems, subtotal: grandSubtotal,
      discount: Math.min(discount, grandSubtotal),
      taxable, gst, roundOff: 0, total: netAmount,
      payments: finalPay, paymentMode: finalPay[0]?.mode || "Cash",
      editedAt: new Date().toISOString(),
    });
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
              <input list="edit-prod-list" value={item.name}
                onChange={(e) => updateItem(item.uid, "name", e.target.value)}
                placeholder="Item name" style={{ ...inp, fontSize: 13 }} />
              <button onClick={() => removeItem(item.uid)}
                style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
              <datalist id="edit-prod-list">{products.map((pr) => <option key={pr.id} value={pr.name} />)}</datalist>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...lbl, fontSize: 10 }}>Price</div>
                <input type="number" value={item.price} onChange={(e) => updateItem(item.uid, "price", e.target.value)} style={{ ...inp, padding: "8px 10px" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...lbl, fontSize: 10 }}>Qty (negative = return)</div>
                <input type="number" value={item.qty} onChange={(e) => updateItem(item.uid, "qty", e.target.value)} style={{ ...inp, padding: "8px 10px" }} />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addItem}
          style={{ width: "100%", padding: "9px 0", background: "#eff6ff", color: "#1e3a5f", border: "2px dashed #93c5fd", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
          + Add Item
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>Discount (₹)</span>
          <input type="number" min={0} value={discount}
            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            style={{ width: 90, textAlign: "right", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 8px", fontSize: 14 }} />
        </div>

        <div style={{ background: "#eff6ff", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6b7280" }}>Taxable</span><span style={{ fontWeight: 700 }}>{f(taxable)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6b7280" }}>GST</span><span style={{ fontWeight: 700 }}>{f(gst)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #bfdbfe", paddingTop: 8, marginTop: 4, fontWeight: 800, fontSize: 15 }}>
            <span>Net</span><span>{f(netAmount)}</span>
          </div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>💳 Payment</div>
        {payments.map((pm, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <select value={pm.mode} onChange={(e) => updatePayment(idx, "mode", e.target.value)}
              style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              {availableModesFor(pm.mode).map((m) => <option key={m}>{m}</option>)}
            </select>
            <input type="number" value={pm.amount}
              onChange={(e) => updatePayment(idx, "amount", parseFloat(e.target.value) || 0)}
              placeholder={idx === 0 && payments.length === 1 ? String(netAmount) : "Amount"}
              style={{ width: 100, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
            {payments.length > 1 && (
              <button onClick={() => removePayment(idx)}
                style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer" }}>✕</button>
            )}
          </div>
        ))}
        {payments.length < PAYMENT_MODES.length && (
          <button onClick={addPayment}
            style={{ width: "100%", padding: "8px 0", background: "#f3f4f6", color: "#374151", border: "1px dashed #d1d5db", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
            + Add Payment Mode
          </button>
        )}
        {paymentMismatch && (
          <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>
            ⚠ Paid {f(totalPaid)} ≠ Net {f(netAmount)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={handleSave}
            style={{ flex: 2, padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            💾 Save Changes
          </button>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
        <button
          onClick={() => { if (window.confirm("Mark as VOID? Invoice kept in records but amounts zeroed.")) onVoidInvoice(); }}
          style={{ width: "100%", marginTop: 8, padding: "11px 0", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          🚫 Void Invoice
        </button>
      </div>
    </div>
  );
}
