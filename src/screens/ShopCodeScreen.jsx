// ─────────────────────────────────────────────
// screens/ShopCodeScreen.jsx
// First screen the user sees. Asks for a shop
// code to look up or create a shop.
//
// Props:
//   onEnter - (shopCode: string) => void
// ─────────────────────────────────────────────
import { useState } from "react";
import { inp, lbl } from "../styles";

export function ShopCodeScreen({ onEnter }) {
  const [code, setCode]       = useState("");
  const [checking, setChecking] = useState(false);
  const [err, setErr]         = useState("");

  const check = async () => {
    if (code.length < 4) return setErr("Min 4 characters");
    setChecking(true);
    setErr("");
    onEnter(code);
    setChecking(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>🧵</div>
          <div style={{ fontWeight: 800, fontSize: 24, color: "#1e3a5f" }}>FabricBill</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>GST Billing for Fabric Shops</div>
        </div>

        <label style={lbl}>Shop Code</label>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20));
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder="e.g. MYSHOP2024"
          style={{ ...inp, marginBottom: 8, letterSpacing: 2, fontWeight: 700, textAlign: "center" }}
          autoFocus
        />
        {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{err}</div>}

        <button
          onClick={check}
          disabled={checking}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}
        >
          {checking ? "Checking…" : "Enter Shop →"}
        </button>
      </div>
    </div>
  );
}
