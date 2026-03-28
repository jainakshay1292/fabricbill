// ─────────────────────────────────────────────
// hooks/useBilling.js
// Owns all billing screen state and logic:
//   - Cart (add / update / remove lines)
//   - Payment rows (split payment support)
//   - GST calculation (blended rate, taxable, round-off)
//   - Saving a new invoice to DB
//
// GST rule (from settings):
//   If item gross taxable >= inclusiveThreshold → gstHigh
//   Otherwise → gstLow
//   Products with gstOverride always use their fixed rate.
// ─────────────────────────────────────────────

import { useState } from "react";
import { saveInvoice } from "../lib/api";
import { PAYMENT_MODES } from "../constants";
import { getItemGstRate } from "../utils/gst";
import { genId } from "../utils/misc";

export function useBilling({ shopCode, role, settings, products, customers, setTransactions }) {

  // ── Cart ──────────────────────────────────────────────────
  const [cart, setCart]                       = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("c1");
  const [discount, setDiscount]               = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [payments, setPayments]               = useState([
    { mode: settings.defaultPaymentMode, amount: "" },
  ]);
  const [saving, setSaving]                   = useState(false);

  // ── Cart helpers ──────────────────────────────────────────
  const addLine    = () => setCart((p) => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);
  const removeLine = (uid) => setCart((p) => p.filter((i) => i.uid !== uid));
  const updateLine = (uid, field, value) =>
    setCart((p) => p.map((i) => (i.uid === uid ? { ...i, [field]: value } : i)));

  // ── Payment row helpers ───────────────────────────────────
  const usedModes       = payments.map((p) => p.mode);
  const availableModesFor = (cur) => PAYMENT_MODES.filter((m) => m === cur || !usedModes.includes(m));
  const canAddPaymentRow  = payments.length < PAYMENT_MODES.length;

  const addPaymentRow = (currentNetAmount, currentTotalPayments) => {
    const remaining = PAYMENT_MODES.filter((m) => !usedModes.includes(m));
    if (!remaining.length) return;
    // Auto-fill the remaining unpaid amount so user doesn't have to calculate
    const alreadyEntered = currentTotalPayments || 0;
    const leftover = Math.max(0, (currentNetAmount || 0) - alreadyEntered);
    setPayments((p) => [...p, { mode: remaining[0], amount: leftover > 0 ? String(leftover) : "" }]);
  };
  const removePaymentRow  = (idx) => setPayments((p) => p.filter((_, i) => i !== idx));
  const updatePaymentRow  = (idx, field, value) =>
    setPayments((p) => p.map((pm, i) => (i === idx ? { ...pm, [field]: value } : pm)));

  // ── GST calculations (derived from cart) ──────────────────
  // Attach gstRate to each cart item based on its value after discount share
  const cartWithTax = cart.map((item) => {
    const price    = parseFloat(item.price) || 0;
    const qty      = parseFloat(item.qty)   || 0;
    const subtotal = price * qty;
    const grandSub = cart.reduce((s, i) => (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0) + s, 0);
    const manualDisc    = Math.min(parseFloat(discount) || 0, grandSub);
    const collected     = parseFloat(amountCollected) || 0;
    const effectiveDisc = collected > 0 ? Math.max(0, grandSub - collected) : manualDisc;
    const itemDiscShare    = grandSub > 0 ? (subtotal / grandSub) * effectiveDisc : 0;
    const grossItemTaxable = subtotal - itemDiscShare;
    const rate = getItemGstRate(item.name, grossItemTaxable, products, settings);
    return { ...item, price, qty, subtotal, gstRate: rate, total: subtotal * (1 + rate) };
  });

  const grandSubtotal  = cartWithTax.reduce((s, i) => s + i.subtotal, 0);
  const manualDiscount = Math.min(parseFloat(discount) || 0, grandSubtotal);
  const collected      = parseFloat(amountCollected) || 0;
  const useCollected   = collected > 0 && grandSubtotal > 0;

  // Blended GST rate across all items (weighted by subtotal)
  const blendedRate = grandSubtotal > 0
    ? cartWithTax.reduce((s, i) => s + (i.subtotal / grandSubtotal) * i.gstRate, 0)
    : 0;

  const grossAfterDiscount = useCollected
    ? Math.max(0, collected)
    : grandSubtotal - manualDiscount;

  const collectedTaxable  = Math.floor(grossAfterDiscount / (1 + blendedRate) * 100) / 100;
  const collectedGST      = Math.round((grossAfterDiscount - collectedTaxable) * 100) / 100;
  const collectedDiscount = useCollected
    ? Math.round(Math.max(0, grandSubtotal - grossAfterDiscount) * 100) / 100
    : manualDiscount;

  const netBeforeRound = useCollected ? collected : collectedTaxable + collectedGST;
  const netAmount      = useCollected ? Math.round(collected) : Math.round(netBeforeRound);
  const roundOff       = Math.round((netAmount - netBeforeRound) * 100) / 100;

  // ── Validation flags ──────────────────────────────────────
  const validCart         = cartWithTax.filter((i) => i.name && i.price !== 0 && i.qty !== 0);
  const totalPayments     = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const creditInPayments  = payments.find((p) => p.mode === "Credit");
  const creditAmount      = parseFloat(creditInPayments?.amount) || 0;
  const hasCredit         = creditAmount > 0;
  const creditNeedsCustomer   = hasCredit && selectedCustomer === "c1";
  const paymentSplitMismatch  = payments.length > 1 && totalPayments > 0 && Math.abs(totalPayments - netAmount) > 1;

  // ── Save invoice ──────────────────────────────────────────
  const handleConfirmPayment = async () => {
    if (validCart.length === 0) return;
    if (creditNeedsCustomer) {
      alert("Credit sales require a named customer. Please select or create a customer.");
      return;
    }
    if (paymentSplitMismatch) {
      alert(`Payment total doesn't match net amount. Please fix.`);
      return;
    }

    setSaving(true);
    try {
      // If single payment row with no amount entered, default to full net amount
      const finalPayments = payments.map((p, i) =>
        i === 0 && payments.length === 1 && !p.amount
          ? { ...p, amount: netAmount }
          : { ...p, amount: parseFloat(p.amount) || 0 }
      );

      const cust  = customers.find((c) => c.id === selectedCustomer) || customers[0];
      const txnId = genId();

      const txn = {
        id: txnId,
        invoiceNo: null, // assigned by saveInvoice
        date:          new Date().toISOString(),
        customer:      cust,
        customerName:  cust.name,
        customerPhone: cust.phone || "",
        items:         validCart,
        subtotal:      grandSubtotal,
        discount:      collectedDiscount,
        taxable:       collectedTaxable,
        gst:           collectedGST,
        roundOff,
        total:         netAmount,
        payments:      finalPayments,
        paymentMode:   finalPayments[0]?.mode || "Cash",
        createdBy:     role,
      };

      // Save invoice — gets invoice number AND inserts in one round trip
      const invoiceNo = await saveInvoice(shopCode, txn);
      const txnFinal  = { ...txn, invoiceNo };

      // Update local state with the final invoice number
      setTransactions((p) => [txnFinal, ...p]);

      // Reset billing form
      resetForm(settings.defaultPaymentMode);
      return txnFinal; // caller (App.js) uses this to show the receipt
    } catch (e) {
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = (defaultMode) => {
    setCart([]);
    setDiscount("");
    setAmountCollected("");
    setPayments([{ mode: defaultMode, amount: "" }]);
    setSelectedCustomer("c1");
  };

  return {
    // Cart state
    cart,
    cartWithTax,
    validCart,
    addLine,
    updateLine,
    removeLine,

    // Customer selection
    selectedCustomer,
    setSelectedCustomer,

    // Discount / amount collected
    discount,
    setDiscount,
    amountCollected,
    setAmountCollected,

    // Payment rows
    payments,
    availableModesFor,
    canAddPaymentRow,
    addPaymentRow,
    removePaymentRow,
    updatePaymentRow,

    // Computed totals
    grandSubtotal,
    blendedRate,
    collectedTaxable,
    collectedGST,
    collectedDiscount,
    netAmount,
    roundOff,

    // Credit helpers
    creditAmount,
    hasCredit,
    creditNeedsCustomer,

    // Validation
    totalPayments,
    paymentSplitMismatch,

    // Actions
    saving,
    handleConfirmPayment,
  };
}
