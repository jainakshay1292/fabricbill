// ─────────────────────────────────────────────
// utils/csv.js
// Helpers to export data as downloadable CSV.
// Used in the History / Report tab.
// ─────────────────────────────────────────────

/**
 * Convert an array of row objects into a CSV string.
 * @param {Object[]} rows   - Array of data objects
 * @param {Object[]} cols   - Array of { key, label } column definitions
 * @returns {string} CSV content
 *
 * Example:
 *   toCSV([{ name: "Silk", qty: 2 }], [{ key: "name", label: "Item" }, { key: "qty", label: "Qty" }])
 *   → '"Item","Qty"\n"Silk","2"'
 */
export function toCSV(rows, cols) {
  const header = cols.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((r) =>
      cols.map((c) => `"${String(r[c.key] || "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  return header + "\n" + body;
}

/**
 * Trigger a CSV file download in the browser.
 * @param {string} content  - CSV string (from toCSV)
 * @param {string} filename - e.g. "FabricBill-Report-March.csv"
 */
export function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
