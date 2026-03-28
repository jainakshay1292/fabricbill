// ─────────────────────────────────────────────
// tabs/BillingTab.jsx
// ─────────────────────────────────────────────
import { fmt } from "../utils/format";
import { card, inp, lbl } from "../styles";
import { useState } from "react";

export function BillingTab({
  cart, cartWithTax, validCart,
  addLine, updateLine, removeLine,
  selectedCustomer, setSelectedCustomer,
  billDate, setBillDate,
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
  customers, products, settings,
  onGoToCustomers,
}) {
  const f = (n) => fmt(n, settings.currency);
  const [custSearch, setCustSearch] = useState("");
  const [custOpen, setCustOpen]     = useState(false);

  // Sort alphabetically, walk-in pinned first
  const sortedCustomers = [...customers].sort((a, b) => {
    if (a.id === "c1") return -1;
    if (b.id === "c1") return 1;
    return a.name.localeCompare(b.name);
  });

  const q = custSearch.trim().toLowerCase();
  const filteredCustomers = q
    ? sortedCustomers.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
      )
    : sortedCustomers;

  const selectedCust = customers.find((c) => c.id === selectedCustomer);

  const pickCustomer = (id) => {
    setSelectedCustomer(id);
    setCustSearch("");
    setCustOpen(false);
  };

  return (
    <>
      {/* ── Customer selector ── */}
      <div style={card}>
        <div style={{ ...lbl, marginBottom: 6 }}>Customer</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, position: "relative" }}>
            {/* Search / selected display */}
            <input
              value={custOpen ? custSearch : (selectedCust ? selectedCust.name + (selectedCust.phone ? " · " + selectedCust.phone : "") : "")}
              onChange={(e) => { setCustSearch(e.target.value); setCustOpen(true); }}
              onFocus={() => { setCustSearch(""); setCustOpen(true); }}
              onBlur={() => setTimeout(() => setCustOpen(false), 180)}
              placeholder="Search by name or phone..."
              style={{ ...inp, margin: 0, borderColor: creditNeedsCustomer ? "#dc2626" : "#d1d5db", width: "100%" }}
            />
            {/* Dropdown list */}
            {custOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 220, overflowY: "auto", marginTop: 2 }}>
                {filteredCustomers.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "#9ca3af" }}>No customer found</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={() => pickCustomer(c.id)}
                      style={{
                        padding: "10px 14px", cursor: "pointer", fontSize: 13,
                        background: c.id === selectedCustomer ? "#eff6ff" : "transparent",
                        borderBottom: "1px solid #f3f4f6",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: c.id === selectedCustomer ? 700 : 500 }}>{c.name}</span>
                      {c.phone && <span style={{ fontSize: 11, color: "#9ca3af" }}>{c.phone}</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
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
          const cartItem    = cartWithTax.find((i) => i.uid === item.uid);
          const rate        = cartItem ? cartItem.gstRate : 0;
          const p           = parseFloat(item.price) || 0;
          const q           = parseFloat(item.qty)   || 0;
          const lineTotal   = p * q;
          const prod        = products.find((pr) => pr.name.toLowerCase() === item.name.toLowerCase());
          const hasOverride = prod && prod.gstOverride !== null && prod.gstOverride !== undefined;
          const isReturn    = q < 0;
          return (
            <div key={item.uid} style={{ background: isReturn ? "#fff1f2" : "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 10, border: isReturn ? "1px solid #fca5a5" : "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 6 }}>
                <input list="prod-list" value={item.name}
                  onChange={(e) => {
                    const val  = e.target.value;
                    const prod = products.find((pr) => pr.name.toLowerCase() === val.toLowerCase());
                    updateLine(item.uid, "name", val);
                    // Auto-fill default qty when product is selected
                    if (prod && prod.defaultQty != null) {
                      updateLine(item.uid, "qty", prod.defaultQty);
                    }
                  }}
                  placeholder="Item name"
                  style={{ ...inp, flex: 1, padding: "8px 10px", fontSize: 13 }} />
                <button onClick={() => removeLine(item.uid)}
                  style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
                <datalist id="prod-list">
                  {products.map((pr) => <option key={pr.id || pr.name} value={pr.name} />)}
                </datalist>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {/* Price — takes most of the space */}
                <div style={{ flex: "0 0 48%", minWidth: 0 }}>
                  <div style={{ ...lbl, fontSize: 11, marginBottom: 4 }}>Price (₹)</div>
                  <input type="number" value={item.price} inputMode="decimal" step="any"
                    onChange={(e) => updateLine(item.uid, "price", e.target.value)}
                    style={{ ...inp, padding: "12px 10px", fontSize: 16, fontWeight: 600, textAlign: "right" }} />
                </div>
                {/* Qty — fixed width enough for buttons + input */}
                <div style={{ flex: "0 0 48%", minWidth: 0 }}>
                  <div style={{ ...lbl, fontSize: 11, marginBottom: 4 }}>Qty {isReturn ? "(Return)" : ""}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    {(() => {
                      const step = prod?.qtyStep || 1;
                      return (<>
                        <button onClick={() => updateLine(item.uid, "qty", parseFloat((q - step).toFixed(4)))}
                          style={{ width: 36, height: 46, flexShrink: 0, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, fontSize: 20, cursor: "pointer", fontWeight: 700, color: "#1e3a5f" }}>−</button>
                        <input type="number" value={item.qty} inputMode="decimal" step={step}
                          onChange={(e) => updateLine(item.uid, "qty", e.target.value)}
                          style={{ flex: 1, minWidth: 0, textAlign: "center", border: "1px solid #d1d5db", borderRadius: 6, padding: "12px 2px", fontSize: 15, fontWeight: 600 }} />
                        <button onClick={() => updateLine(item.uid, "qty", parseFloat((q + step).toFixed(4)))}
                          style={{ width: 36, height: 46, flexShrink: 0, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, fontSize: 20, cursor: "pointer", fontWeight: 700, color: "#1e3a5f" }}>+</button>
                      </>);
                    })()}
                  </div>
                </div>
              </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10, paddingBottom: 10, borderBottom: "1px dashed #e5e7eb" }}>
            <span style={{ color: "#6b7280" }}>Subtotal ({cart.length} item{cart.length > 1 ? "s" : ""})</span>
            <span style={{ fontWeight: 700 }}>{f(grandSubtotal)}</span>
          </div>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ ...lbl, color: "#92400e", marginBottom: 6 }}>💵 Amount Collected</div>
            <input type="number" min={0} value={amountCollected}
              onChange={(e) => { setAmountCollected(e.target.value); setDiscount(""); }}
              placeholder={"Full price: " + f(grandSubtotal)}
              style={{ ...inp, border: "1px solid #fcd34d", fontWeight: 700, fontSize: 15, background: "#fffde7" }} />
            <div style={{ fontSize: 10, color: "#92400e", marginTop: 5 }}>Leave blank to use full price or manual discount</div>
          </div>

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
          <div style={{ marginTop: 4 }}>
            <div style={{ ...lbl, marginBottom: 8 }}>💳 Payment Mode(s)</div>
            {payments.map((pm, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                {/* Mode selector as pill buttons — always fits on one line */}
                <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "nowrap" }}>
                  {availableModesFor(pm.mode).map((m) => (
                    <button key={m} onClick={() => updatePaymentRow(idx, "mode", m)}
                      style={{
                        flex: 1, padding: "9px 4px", border: "none", borderRadius: 8,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        background: pm.mode === m ? "#1e3a5f" : "#f3f4f6",
                        color:      pm.mode === m ? "#fff"    : "#374151",
                      }}>
                      {m}
                    </button>
                  ))}
                  {payments.length > 1 && (
                    <button onClick={() => removePaymentRow(idx)}
                      style={{ padding: "9px 12px", background: "#fee2e2", border: "none", borderRadius: 8, color: "#dc2626", cursor: "pointer", fontWeight: 700, flexShrink: 0 }}>✕</button>
                  )}
                </div>
                {/* Amount input — full width, large */}
                <input type="number" value={pm.amount} inputMode="decimal"
                  onChange={(e) => updatePaymentRow(idx, "amount", e.target.value)}
                  placeholder={idx === 0 && payments.length === 1 ? String(netAmount) : "Amount"}
                  style={{ ...inp, padding: "12px 14px", fontSize: 16, fontWeight: 600, textAlign: "right" }} />
              </div>
            ))}
            {canAddPaymentRow && (
              <button onClick={() => addPaymentRow(netAmount, payments)}
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
          {/* ── Invoice date — defaults to today, change for backdated invoices ── */}
          <div style={{ marginTop: 12, background: "#f8faff", borderRadius: 10, padding: "10px 14px", border: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>📅 Invoice Date</span>
            <input type="date" value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 600, color: "#1e3a5f", background: "#fff" }} />
          </div>

          <button onClick={handleConfirmPayment}
            disabled={validCart.length === 0 || saving || creditNeedsCustomer || paymentSplitMismatch}
            style={{ marginTop: 14, width: "100%", padding: "15px 0", background: (validCart.length === 0 || saving || creditNeedsCustomer || paymentSplitMismatch) ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: "pointer" }}>
            {saving ? "Saving…" : "✅ Confirm Payment"}
          </button>
        </div>
      )}
    </>
  );
}
