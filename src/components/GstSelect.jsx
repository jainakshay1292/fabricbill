// ─────────────────────────────────────────────
// components/GstSelect.jsx
// Reusable GST rate dropdown.
// Used in: BillingTab (per item), ProductsTab (override)
//
// Props:
//   value    - current rate ("default" | "0" | "5" | "18")
//   onChange - callback with new string value
// ─────────────────────────────────────────────

import { GST_RATES } from "../constants";

export default function GstSelect({ value, onChange }) {
  return (
    <select
      value={value === null || value === undefined ? "default" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 10px",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        fontSize: 13,
        background: "#fff",
      }}
    >
      <option value="default">Default</option>
      {GST_RATES.map((v) => (
        <option key={v} value={String(v)}>
          {v}%
        </option>
      ))}
    </select>
  );
}
