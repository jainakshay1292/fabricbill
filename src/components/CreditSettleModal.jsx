// ─────────────────────────────────────────────
// components/CreditSettleModal.jsx
// ─────────────────────────────────────────────
import { useState } from "react";
import { fmt } from "../utils/format";
import { inp, lbl } from "../styles";

export function CreditSettleModal({ customer, outstanding, settings, onConfirm, onCancel }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode]     = useState("Cash");
  const f = (n) => fmt(n, settings.currency);

  const handleConfirm = () => {
    const amt = parseFloat(String(amount).trim());
    if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
    if (amt > outstanding + 0.01) return alert("Amount cannot exceed outstanding " + f(outstanding));
    onConfirm(amt, mode);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 4 }}>💳 Settle Credit</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Customer: <b>{customer.name}</b></div>
        <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 700 }}>Outstanding</span>
          <span style={{ fontSize: 15, color: "#dc2626", fontWeight: 900 }}>{f(outstanding)}</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Amount Received (₹)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder={String(outstanding)} style={inp} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Payment Mode</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["Cash", "UPI", "Card"].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", background: mode === m ? "#1e3a5f" : "#f3f4f6", color: mode === m ? "#fff" : "#374151" }}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleConfirm}
          style={{ width: "100%", padding: "13px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>
          ✅ Confirm Settlement
        </button>
        <button onClick={onCancel}
          style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
