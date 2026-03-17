// ─────────────────────────────────────────────
// constants/index.js
// All app-wide static values live here.
// If you add a new payment mode or GST rate,
// this is the ONLY file you need to change.
// ─────────────────────────────────────────────

export const PAYMENT_MODES = ["Cash", "UPI", "Card", "Credit"];

export const GST_RATES = [0, 5, 18];

export const defaultSettings = {
  shopName: "MY SHOP",
  shopTagline: "",
  shopAddress: "",
  shopPhone: "",
  gstin: "",
  stateCode: "",
  footerNote: "",
  signoff: "For MY SHOP",
  gstLow: 5,
  gstHigh: 18,
  gstThreshold: 2500,
  currency: "₹",
  enableDiscount: true,
  defaultPaymentMode: "Cash",
  adminPinHash: "",
  staffPinHash: "",
};
