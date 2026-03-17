

// ─────────────────────────────────────────────
// tabs/BillingTab.jsx
// Main billing screen. Handles item entry,
// GST summary, payment modes, and bill saving.
//
// All state + logic comes from useBilling hook.
// This component is purely presentational.
//
// Props: see bottom of file
// ─────────────────────────────────────────────
import { fmt } from "../utils/format";
import { card, inp, lbl } from "../styles";
import { PAYMENT_MODES } from "../constants";

export function BillingTab({
  // From useBilling hook
  cart, cartWithTax, validCart,
  addLine, updateLine, removeLine,
  selectedCustomer, setSelectedCustomer,
  discount, setDiscount,
  amountCollected, setAmountCollected,
  payments, availableModesFor, canAddPaymentRow,
  addPaymentRow, removePaymentRow, updatePaymentRow,
  grandSubtotal, blendedRate,
  collectedTaxable, collectedGST, collectedDiscount,
  netAmount, roundOff,
  creditAmount, creditNeedsCustomer,
  totalPayments, paymentSplitMismatch,
  saving, handleConfirmPayment,
  // From app
  customers, products, settings,
  onGoToCustomers,   // navigate to Customers tab to add new customer
}) {
  const f = (n) => fmt(n, settings.currency);

  return (
    <>
      {/* ── Customer selector ── */}
      <div style={card}>
        <div style={{ ...lbl, marginBottom: 6 }}>Customer</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            style={{ ...inp, flex: 1, margin: 0, borderColor: creditNeedsCustomer ? "#dc2626" : "#d1d5db" }}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>
            ))}
          </select>
          <button onClick={onGoToCustomers}
            style={{ padding: "10px 14px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
            + New
          </button>
        </div>
        {creditNeedsCustomer && (
          <div style={{ color: "#dc2626", fontSize: 12, marginTop: 6, fontWeight: 600 }}>
            ⚠ Credit sales require a named customer.
          </div>
        )}
      </div>

      {/* ── Cart items ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🧾 Items</div>

        {cart.map((item) => {
          const cartItem = cartWithTax.find((i) => i.uid === item.uid);
          const rate     = cartItem ? cartItem.gstRate : 0;
          const p        = parseFloat(item.price) || 0;
          const q        = parseFloat(item.qty)   || 0;
          const lineTotal = p * q;
          const prod      = products.find((pr) => pr.name.toLowerCase() === item.name.toLowerCase());
          const hasOverride = prod && prod.gstOverride !== null && prod.gstOverride !== undefined;
          const isReturn    = q < 0;

          return (
            <div key={item.uid} style={{ background: isReturn ? "#fff1f2" : "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 10, border: isReturn ? "1px solid #fca5a5" : "1px solid #e5e7eb" }}>
              {/* Name row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 6 }}>
                <input
                  list="prod-list"
                  value={item.name}
                  onChange={(e) => updateLine(item.uid, "name", e.target.value)}
                  placeholder="Item name"
                  style={{ ...inp, flex: 1, padding: "8px 10px", fontSize: 13 }}
                />
                <button onClick={() => removeLine(item.uid)}
                  style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
                <datalist id="prod-list">
                  {products.map((pr) => <option key={pr.id || pr.name} value={pr.name} />)}
                </datalist>
              </div>

              {/* Price + Qty row */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...lbl, fontSize: 10 }}>Price (₹)</div>
                  <input type="number" value={item.price} onChange={(e) => updateLine(item.uid, "price", e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} />
                </div>
                <div style={{ width: 120 }}>
                  <div style={{ ...lbl, fontSize: 10 }}>Qty {isReturn ? "(Return)" : ""}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => updateLine(item.uid, "qty", parseFloat((q - 1).toFixed(2)))}
                      style={{ width: 32, height: 38, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#1e3a5f" }}>−</button>
                    <input type="number" value={item.qty} onChange={(e) => updateLine(item.uid, "qty", e.target.value)}
                      style={{ width: 46, textAlign: "center", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 4px", fontSize: 13 }} />
                    <button onClick={() => updateLine(item.uid, "qty", parseFloat((q + 1).toFixed(2)))}
                      style={{ width: 32, height: 38, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#1e3a5f" }}>+</button>
                  </div>
                </div>
              </div>

              {/* GST tag */}
              {p !== 0 && q !== 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, background: "#fff", borderRadius: 6, padding: "5px 8px", border: "1px solid #e5e7eb" }}>
                  <span style={{ color: isReturn ? "#dc2626" : hasOverride ? "#7c3aed" : rate * 100 >= settings.gstHigh ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                    {isReturn ? "↩ Return" : `GST ${(rate * 100).toFixed(0)}%${hasOverride ? " ★" : ""}`}
                  </span>
                  <span style={{ fontWeight: 800, color: isReturn ? "#dc2626" : "#1e3a5f" }}>{f(lineTotal)}</span>
                </div>
              )}
            </div>
          );
        })}

        {cart.length === 0 && (
          <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0", background: "#f9fafb", borderRadius: 8, border: "1px dashed #e5e7eb" }}>
            Tap "+ Add Item" to start billing
          </div>
        )}
        <button onClick={addLine}
          style={{ width: "100%", padding: "12px 0", background: "#eff6ff", color: "#1e3a5f", border: "2px dashed #93c5fd", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>
          + Add Item
        </button>
      </div>

      {/* ── Summary + payment ── */}
      {cart.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#1e3a5f" }}>💰 Summary</div>

          {/* Subtotal */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10, paddingBottom: 10, borderBottom: "1px dashed #e5e7eb" }}>
            <span style={{ color: "#6b7280" }}>Subtotal ({cart.length} item{cart.length > 1 ? "s" : ""})</span>
            <span style={{ fontWeight: 700 }}>{f(grandSubtotal)}</span>
          </div>

          {/* Amount collected (overrides discount) */}
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ ...lbl, color: "#92400e", marginBottom: 6 }}>💵 Amount Collected</div>
            <input
              type="number" min={0} value={amountCollected}
              onChange={(e) => { setAmountCollected(e.target.value); setDiscount(""); }}
              placeholder={"Full price: " + f(grandSubtotal)}
              style={{ ...inp, border: "1px solid #fcd34d", fontWeight: 700, fontSize: 15, background: "#fffde7" }}
            />
            <div style={{ fontSize: 10, color: "#92400e", marginTop: 5 }}>Leave blank to use full price or manual discount</div>
          </div>

          {/* Manual discount (only when amount collected is empty) */}
          {settings.enableDiscount && !amountCollected && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, background: "#f9fafb", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>Discount (₹)</span>
              <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)}
                style={{ width: 90, textAlign: "right", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 8px", fontSize: 14, background: "#fff" }} />
            </div>
          )}

          {/* GST breakdown */}
          <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            {collectedDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#dc2626" }}>
                <span>Discount</span><span style={{ fontWeight: 700 }}>− {f(collectedDiscount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#6b7280" }}>
              <span>Taxable Value</span><span style={{ fontWeight: 600 }}>{f(collectedTaxable)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#6b7280" }}>
              <span>GST ({(blendedRate * 100).toFixed(0)}%)</span><span style={{ fontWeight: 600 }}>{f(collectedGST)}</span>
            </div>
            {roundOff !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, color: "#9ca3af" }}>
                <span>Round Off</span><span>{(roundOff > 0 ? "+" : "") + f(roundOff)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, fontWeight: 900, color: "#1e3a5f", borderTop: "2px solid #16a34a", paddingTop: 10, marginTop: 4 }}>
              <span>Net Amount</span><span style={{ color: "#16a34a" }}>{f(netAmount)}</span>
            </div>
          </div>

          {/* Payment mode(s) */}
          <div style={{ marginTop: 4 }}>
            <div style={{ ...lbl, marginBottom: 8 }}>💳 Payment Mode(s)</div>
            {payments.map((pm, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <select value={pm.mode} onChange={(e) => updatePaymentRow(idx, "mode", e.target.value)}
                  style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
                  {availableModesFor(pm.mode).map((m) => <option key={m}>{m}</option>)}
                </select>
                <input type="number" value={pm.amount}
                  onChange={(e) => updatePaymentRow(idx, "amount", e.target.value)}
                  placeholder={idx === 0 && payments.length === 1 ? String(netAmount) : "Amount"}
                  style={{ width: 100, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
                {payments.length > 1 && (
                  <button onClick={() => removePaymentRow(idx)}
                    style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
                )}
              </div>
            ))}
            {canAddPaymentRow && (
              <button onClick={addPaymentRow}
                style={{ width: "100%", padding: "8px 0", background: "#f3f4f6", color: "#374151", border: "1px dashed #d1d5db", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 4 }}>
                + Split Payment
              </button>
            )}
            {paymentSplitMismatch && (
              <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>
                ⚠ Total paid {f(totalPayments)} ≠ Net {f(netAmount)}
              </div>
            )}
            {creditAmount > 0 && (
              <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginTop: 8, fontWeight: 700, color: "#dc2626", fontSize: 13 }}>
                ⚠ Credit: {f(creditAmount)}{creditNeedsCustomer ? " — Select a named customer first" : ""}
              </div>
            )}
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirmPayment}
            disabled={validCart.length === 0 || saving || creditNeedsCustomer || paymentSplitMismatch}
            style={{ marginTop: 14, width: "100%", padding: "15px 0", background: (validCart.length === 0 || saving || creditNeedsCustomer || paymentSplitMismatch) ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: "pointer" }}>
            {saving ? "Saving…" : "✅ Confirm Payment"}
          </button>
        </div>
      )}
    </>
  );
}


// ─────────────────────────────────────────────
// tabs/CustomersTab.jsx
// Add new customers and view all customers
// with their billing totals, outstanding
// credit, and ledger access.
//
// Props:
//   customers              - customer list
//   setCustomers           - state setter
//   transactions           - all transactions
//   settlements            - all settlements
//   getCustomerOutstanding - (custId) => number
//   settings               - shop settings
//   shopCode               - for API calls
//   onSettle               - (customer) => void  (opens CreditSettleModal)
//   onViewLedger           - (customer) => void  (opens CustomerLedger)
// ─────────────────────────────────────────────
import { useState } from "react";
import { upsertCustomer } from "../lib/api";
import { fmt } from "../utils/format";
import { genId } from "../utils/misc";
import { card, inp, lbl } from "../styles";

export function CustomersTab({
  customers, setCustomers,
  transactions, settlements,
  getCustomerOutstanding,
  settings, shopCode,
  onSettle, onViewLedger,
}) {
  const [newName, setNewName]       = useState("");
  const [newPhone, setNewPhone]     = useState("");
  const [custError, setCustError]   = useState("");
  const [custSuccess, setCustSuccess] = useState("");
  const f = (n) => fmt(n, settings.currency);

  const handleCreate = async () => {
    setCustError(""); setCustSuccess("");
    if (!newName.trim()) return setCustError("Name required.");
    if (!newPhone.match(/^\d{10}$/)) return setCustError("Enter valid 10-digit number.");
    if (customers.find((c) => c.phone === newPhone)) return setCustError("Phone already registered.");
    const nc = { id: genId(), name: newName.trim(), phone: newPhone };
    await upsertCustomer(shopCode, nc);
    setCustomers((p) => [...p, nc]);
    setCustSuccess(`"${nc.name}" added!`);
    setNewName(""); setNewPhone("");
  };

  return (
    <>
      {/* ── Add customer form ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>➕ New Customer</div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Full Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Rajesh Kumar" style={inp} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Phone Number</label>
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile" inputMode="numeric" style={inp}
          />
        </div>
        {custError   && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ {custError}</div>}
        {custSuccess && <div style={{ color: "#16a34a", fontSize: 13, marginBottom: 8, background: "#f0fdf4", padding: "6px 10px", borderRadius: 6 }}>✅ {custSuccess}</div>}
        <button onClick={handleCreate}
          style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Create Customer
        </button>
      </div>

      {/* ── Customer list ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>👥 All Customers ({customers.length})</div>
        {customers.map((c, i) => {
          const txns       = transactions.filter((t) => t.customer?.id === c.id || t.customerId === c.id);
          const spent      = txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.total || 0), 0);
          const outstanding = getCustomerOutstanding(c.id);
          return (
            <div key={c.id} style={{ padding: "12px 0", borderBottom: i < customers.length - 1 ? "1px solid #f3f4f6" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{c.phone || "No phone"} · {txns.length} bill{txns.length !== 1 ? "s" : ""}</div>
                  {outstanding > 0 && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginTop: 2 }}>⚠ Outstanding: {f(outstanding)}</div>}
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 14 }}>{f(spent)}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>total billed</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {outstanding > 0 && (
                      <button onClick={() => onSettle(c)}
                        style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        💳 Settle
                      </button>
                    )}
                    <button onClick={() => onViewLedger(c)}
                      style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      📒 Ledger
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
