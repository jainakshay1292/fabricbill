// ─────────────────────────────────────────────
// utils/format.js
// All display formatting helpers.
// Pure functions — no side effects, easy to test.
// ─────────────────────────────────────────────

/** Format a number as currency. e.g. fmt(1500) → "₹1500.00" */
export const fmt = (n, cur = "₹") => cur + Number(n).toFixed(2);

/** Format a date string to "12 Jan 2025" */
export const fmtDate = (d) => {
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return dt.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-";
  }
};

/** Format a date string to "12 Jan 2025, 02:30 PM" */
export const fmtDateTime = (d) => {
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return dt.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
};

/**
 * Convert a number to Indian words.
 * e.g. numToWords(1500) → "One Thousand Five Hundred"
 */
export function numToWords(n) {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety",
  ];
  n = Math.round(n);
  if (n === 0)        return "Zero";
  if (n < 20)         return ones[n];
  if (n < 100)        return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  if (n < 1_000)      return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numToWords(n % 100) : "");
  if (n < 100_000)    return numToWords(Math.floor(n / 1_000)) + " Thousand" + (n % 1_000 ? " " + numToWords(n % 1_000) : "");
  if (n < 10_000_000) return numToWords(Math.floor(n / 100_000)) + " Lakh" + (n % 100_000 ? " " + numToWords(n % 100_000) : "");
  return numToWords(Math.floor(n / 10_000_000)) + " Crore" + (n % 10_000_000 ? " " + numToWords(n % 10_000_000) : "");
}
