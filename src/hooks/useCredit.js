// ─────────────────────────────────────────────
// hooks/useCredit.js
// Owns all credit / outstanding balance logic:
//   - Calculate how much a customer owes
//   - Record a settlement payment
//   - Generate a receipt voucher
//
// Kept separate from useBilling so a bug in
// credit logic can never affect invoice creation.
// ─────────────────────────────────────────────

import { useCallback } from "react";
import { insertSettlement, getNextVoucherNo } from "../lib/api";
import { genId } from "../utils/misc";

export function useCredit({ shopCode, role, transactions, settlements, setSettlements }) {

  /**
   * Calculate how much a customer currently owes.
   * Formula: total credit billed − total settled
   *
   * @param {string} custId - customer ID
   * @returns {number} outstanding amount (never negative)
   */
  const getCustomerOutstanding = useCallback(
    (custId) => {
      const custTxns = transactions.filter(
        (t) => !t.void && !t.cancelled &&
          (t.customer?.id === custId || t.customerId === custId)
      );

      // Total invoiced (all bills)
      const totalInvoiced = custTxns.reduce((sum, t) => sum + (t.total || 0), 0);

      // Total paid at time of billing (non-credit payments only)
      const totalPaidAtBilling = custTxns.reduce((sum, t) => {
        const payments = t.payments?.length > 0
          ? t.payments
          : [{ mode: t.paymentMode || "Cash", amount: t.total || 0 }];
        const paidNow = payments
          .filter((p) => p.mode !== "Credit")
          .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        return sum + paidNow;
      }, 0);

      // Total settled later (credit settlements)
      const totalSettled = settlements
        .filter((s) => s.customerId === custId)
        .reduce((sum, s) => sum + (s.amount || 0), 0);

      // Outstanding = invoiced − paid at billing − settled later
      // Negative means overpaid (advance/credit in customer's favour)
      return Math.round((totalInvoiced - totalPaidAtBilling - totalSettled) * 100) / 100;
    },
    [transactions, settlements]
  );

  /**
   * Record a credit settlement payment.
   * Creates a receipt voucher, saves to DB, updates local state.
   *
   * @param {Object} customer    - full customer object
   * @param {number} amount      - amount being settled
   * @param {string} paymentMode - "Cash" | "UPI" | "Card"
   * @returns {Object} the voucher object (so caller can show ReceiptVoucher modal)
   */
  const handleSettle = async (customer, amount, paymentMode) => {
    const outstanding = getCustomerOutstanding(customer.id);
    const voucherNo   = await getNextVoucherNo(shopCode);

    const voucher = {
      id:                   genId(),
      voucherNo,
      date:                 new Date().toISOString(),
      customerId:           customer.id,
      customerName:         customer.name,
      customerPhone:        customer.phone || "",
      amount,
      paymentMode,
      prevOutstanding:      outstanding,
      remainingOutstanding: Math.max(0, outstanding - amount),
      settledBy:            role,
    };

    await insertSettlement(shopCode, voucher);
    setSettlements((p) => [voucher, ...p]);
    return voucher; // caller shows ReceiptVoucher modal with this
  };

  return {
    getCustomerOutstanding,
    handleSettle,
  };
}
