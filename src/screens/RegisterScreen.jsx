// ─────────────────────────────────────────────
// screens/RegisterScreen.jsx
// Shown when a shop code has no existing data.
// Collects shop name + admin/staff PINs.
//
// Props:
//   shopCode     - the entered shop code string
//   onRegistered - () => void  (called after success)
// ─────────────────────────────────────────────
import { useState } from "react";
import { registerShop, hashPin } from "../lib/api";
import { defaultSettings } from "../constants";
import { inp, lbl } from "../styles";

export function RegisterScreen({ shopCode, onRegistered, onBack }) {
  const [form, setForm]     = useState({ shopName: "", adminPin: "", staffPin: "" });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handle = async () => {
    if (!form.shopName.trim() || form.adminPin.length < 4 || form.staffPin.length < 4)
      return alert("Fill all fields with 4-digit PINs");
    setLoading(true);
    try {
      const adminPinHash = await hashPin(form.adminPin);
      const staffPinHash = await hashPin(form.staffPin);
      await registerShop(shopCode, {
        ...defaultSettings,
        shopName: form.shopName.trim(),
        signoff: "For " + form.shopName.trim(),
        adminPinHash,
        staffPinHash,
      });
      onRegistered();
    } catch (e) {
      alert("Registration failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Field definitions: [stateKey, label, inputType, placeholder]
  const fields = [
    ["shopName", "Shop Name",            "text",     "My Fabric Shop"],
    ["adminPin", "Admin PIN (4 digits)", "password", "••••"],
    ["staffPin", "Staff PIN (4 digits)", "password", "••••"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>🏪</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#1e3a5f" }}>Register Shop</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Code: <b>{shopCode}</b></div>
        </div>

        {fields.map(([k, l, t, ph]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={lbl}>{l}</label>
            <input
              type={t}
              maxLength={k.includes("Pin") ? 4 : 60}
              value={form[k]}
              onChange={(e) =>
                set(k, k.includes("Pin")
                  ? e.target.value.replace(/\D/g, "").slice(0, 4)
                  : e.target.value)
              }
              placeholder={ph}
              inputMode={k.includes("Pin") ? "numeric" : "text"}
              style={inp}
            />
          </div>
        ))}

        <button
          onClick={handle}
          disabled={loading}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}
        >
          {loading ? "Registering…" : "Register & Start →"}
        </button>

        <button
          onClick={onBack}
          style={{ width: "100%", marginTop: 10, padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          ← Wrong code? Go back
        </button>
      </div>
    </div>
  );
}
