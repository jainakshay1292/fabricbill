// ─────────────────────────────────────────────
// utils/gst.js
// All GST computation logic in one place.
// Pure functions — no React, no state.
// ─────────────────────────────────────────────

/**
 * Determine the GST rate for a single line item.
 *
 * Priority order:
 *   1. Product has a fixed gstOverride set in the Products tab → use that
 *   2. Item gross taxable value >= threshold → use gstHigh
 *   3. Otherwise → use gstLow
 *
 * @param {string} itemName
 * @param {number} grossItemTaxable - item subtotal after its share of discount
 * @param {Object[]} products       - product list from DB
 * @param {Object}  settings        - shop settings (gstLow, gstHigh, gstThreshold)
 * @returns {number} GST rate as a decimal, e.g. 0.05 for 5%
 */
export function getItemGstRate(itemName, grossItemTaxable, products, settings) {
  const prod = products.find(
    (p) => p.name.toLowerCase() === itemName.toLowerCase()
  );
  if (prod && prod.gstOverride !== null && prod.gstOverride !== undefined) {
    return prod.gstOverride / 100;
  }
  const inclusiveThreshold =
    settings.gstThreshold * (1 + settings.gstLow / 100);
  return grossItemTaxable >= inclusiveThreshold
    ? settings.gstHigh / 100
    : settings.gstLow / 100;
}

/**
 * Build GST breakdown rows for an invoice's summary table.
 * Groups items by their GST rate and computes CGST + SGST for each group.
 *
 * @param {Object[]} items    - invoice line items (each with gstRate, subtotal)
 * @param {number}  taxable   - total taxable value of the invoice
 * @param {number}  subtotal  - gross subtotal before discount
 * @returns {Object[]} Array of { rate, half, taxableAmt, cgst, sgst }
 *
 * Example output:
 *   [{ rate: "5.0", half: "2.5", taxableAmt: 1000, cgst: 25, sgst: 25 }]
 */
export function buildGstRows(items, taxable, subtotal) {
  // Group item subtotals by GST rate
  const groups = {};
  items.forEach((item) => {
    const rate = (item.gstRate * 100).toFixed(1);
    if (!groups[rate]) groups[rate] = 0;
    groups[rate] += item.subtotal;
  });

  return Object.entries(groups)
    .filter(([rate]) => parseFloat(rate) !== 0)
    .map(([rate, amt]) => {
      const share      = subtotal > 0 ? amt / subtotal : 0;
      const half       = (parseFloat(rate) / 2).toFixed(1);
      const taxableAmt = Math.round(taxable * share * 100) / 100;
      const gstRaw     = taxableAmt * parseFloat(rate) / 100;

      // parseFloat(.toFixed(2)) gives correct standard rounding for both:
      //   53.33325 → 53.33  (not 53.34)
      //   65.47625 → 65.48  (not 65.47)
      // Both CGST and SGST always show the same value
      const cgst = parseFloat((gstRaw / 2).toFixed(2));
      const sgst = cgst;

      return { rate, half, taxableAmt, cgst, sgst };
    });
}
