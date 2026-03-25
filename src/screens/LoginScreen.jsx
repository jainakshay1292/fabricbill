
// ─────────────────────────────────────────────
// screens/LoginScreen.jsx
// PIN pad login. User picks Admin or Staff role
// then enters their 4-digit PIN.
//
// Props:
//   onLogin      - (role: "admin" | "staff") => void
//   settings     - shop settings (not used directly, kept for future use)
//   shopCode     - displayed in the header
//   onChangeShop - () => void
// ─────────────────────────────────────────────
import { useState, useEffect } from "react";
import { loginWithPin } from "../lib/api";

export function LoginScreen({ onLogin, shopCode, onChangeShop }) {
  const [role, setRole]       = useState(null);   // null | "admin" | "staff"
  const [pin, setPin]         = useState("");
  const [err, setErr]         = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-submit as soon as 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) submit();
  }, [pin]);

  const submit = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setErr("");
    try {
      const { token } = await loginWithPin(shopCode, role, pin);
      onLogin(role, token);
    } catch (e) {
      setErr(e.message || "Wrong PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const appendDigit = (d) => {
    if (pin.length < 4) setPin((p) => p + String(d));
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* App header */}
      <div style={{ fontSize: 40, marginBottom: 4 }}>🧵</div>
      <div style={{ fontWeight: 900, fontSize: 22, color: "#fff", marginBottom: 2 }}>FabricBill</div>
      <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
        🏪 {shopCode}
      </div>
      <button onClick={onChangeShop} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", marginBottom: 28 }}>
        ← Change Shop
      </button>

      {/* Step 1: Pick role */}
      {!role ? (
        <div style={{ display: "flex", gap: 20 }}>
          {[
            ["admin", "🔐", "Admin", "#1e3a5f"],
            ["staff", "👤", "Staff", "#16a34a"],
          ].map(([r, icon, label, bg]) => (
            <button key={r}
              onClick={() => { setRole(r); setPin(""); setErr(""); }}
              style={{ width: 136, height: 136, borderRadius: 18, border: "none", background: bg, color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.2)" }}>
              <span style={{ fontSize: 38 }}>{icon}</span>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>

      ) : (
        /* Step 2: Enter PIN */
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", width: 290, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>
            {role === "admin" ? "🔐 Admin" : "👤 Staff"} PIN
          </div>

          {/* PIN dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 16, marginTop: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: pin.length > i ? "#1e3a5f" : "#e5e7eb", transition: "background 0.2s" }} />
            ))}
          </div>

          {/* Error */}
          {err && (
            <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 10, background: "#fee2e2", borderRadius: 6, padding: "6px 10px" }}>
              ⚠ {err}
            </div>
          )}

          {/* Number pad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, justifyItems: "center", marginBottom: 12 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button key={d} onClick={() => appendDigit(d)}
                style={{ width: 66, height: 66, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#1e3a5f", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>
                {d}
              </button>
            ))}
            {/* Backspace */}
            <button onClick={() => setPin((p) => p.slice(0, -1))}
              style={{ width: 66, height: 66, borderRadius: "50%", border: "1px solid #fee2e2", background: "#fee2e2", color: "#dc2626", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>
              ⌫
            </button>
            {/* 0 */}
            <button onClick={() => appendDigit(0)}
              style={{ width: 66, height: 66, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#1e3a5f", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>
              0
            </button>
            {/* Empty cell — auto-submits on 4th digit, no confirm needed */}
            <div style={{ width: 66, height: 66 }} />
          </div>

          <button onClick={() => { setRole(null); setPin(""); setErr(""); }}
            style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
