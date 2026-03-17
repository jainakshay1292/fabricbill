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
      // Sum all credit amounts on non-void invoices for this customer
      const totalCreditBilled = transactions
        .filter(
          (t) =>
            !t.void &&
            !t.cancelled &&
            (t.customer?.id === custId || t.customerId === custId)
        )
        .reduce((sum, t) => {
          const creditAmt = t.payments
            ? t.payments.find((p) => p.mode === "Credit")?.amount || 0
            : t.paymentMode === "Credit"
            ? t.total
            : 0;
          return sum + creditAmt;
        }, 0);

      // Sum all settlements recorded for this customer
      const totalSettled = settlements
        .filter((s) => s.customerId === custId)
        .reduce((sum, s) => sum + s.amount, 0);

      return Math.max(0, totalCreditBilled - totalSettled);
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
