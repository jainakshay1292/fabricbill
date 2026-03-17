
// ─────────────────────────────────────────────
// tabs/SettingsTab.jsx
// Admin-only. Edit shop info, GST config,
// billing options, and change PINs.
//
// Props:
//   draftSettings    - working copy of settings
//   setDraftSettings - state setter
//   handleSaveSettings - async () => void
//   handleChangeShop - () => void
//   shopCode         - displayed at top
// ─────────────────────────────────────────────
import { useState } from "react";
import { PAYMENT_MODES } from "../constants";
import { card, inp, lbl } from "../styles";

export function SettingsTab({ draftSettings, setDraftSettings, handleSaveSettings, handleChangeShop, shopCode }) {
  const [newAdminPin, setNewAdminPin] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");
  const set = (k, v) => setDraftSettings((p) => ({ ...p, [k]: v }));

  const onSave = () =>
    handleSaveSettings({
      newAdminPin,
      newStaffPin,
      onSuccess: () => { setNewAdminPin(""); setNewStaffPin(""); alert("Settings saved ✅"); },
    });

  return (
    <>
      {/* Shop code banner */}
      <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>🏪 <b>{shopCode}</b></span>
        <button onClick={handleChangeShop} style={{ background: "none", border: "1px solid #92400e", borderRadius: 6, color: "#92400e", padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>Switch Shop</button>
      </div>

      {/* Shop info */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🏪 Shop Info</div>
        {[
          ["shopName", "Shop Name"], ["shopTagline", "Tagline / Slogan"],
          ["shopAddress", "Address"], ["shopPhone", "Phone"],
          ["gstin", "GSTIN"],        ["stateCode", "State Code"],
        ].map(([k, l]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={lbl}>{l}</label>
            <input value={draftSettings[k] || ""} onChange={(e) => set(k, e.target.value)} style={inp} />
          </div>
        ))}
      </div>

      {/* Invoice footer */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🧾 Invoice Footer</div>
        {[["footerNote", "Footer Note"], ["signoff", "Sign-off Text"]].map(([k, l]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={lbl}>{l}</label>
            <input value={draftSettings[k] || ""} onChange={(e) => set(k, e.target.value)} style={inp} />
          </div>
        ))}
      </div>

      {/* GST config */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🏛 GST Config</div>
        {[["gstLow", "GST Low Rate (%)"], ["gstHigh", "GST High Rate (%)"], ["gstThreshold", "Taxable Threshold (₹)"]].map(([k, l]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={lbl}>{l}</label>
            <input type="number" value={draftSettings[k]} onChange={(e) => set(k, parseFloat(e.target.value) || 0)} style={inp} />
          </div>
        ))}
        <div style={{ background: "#eff6ff", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#1e40af" }}>
          <b>Rule:</b> If item (after discount) ≥ {draftSettings.currency}{(draftSettings.gstThreshold * (1 + draftSettings.gstLow / 100)).toFixed(0)} → {draftSettings.gstHigh}% GST, otherwise {draftSettings.gstLow}%
        </div>
      </div>

      {/* Billing options */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>⚙️ Billing Options</div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Currency Symbol</label>
          <input value={draftSettings.currency} onChange={(e) => set("currency", e.target.value)} style={{ ...inp, width: 80 }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Default Payment Mode</label>
          <select value={draftSettings.defaultPaymentMode} onChange={(e) => set("defaultPaymentMode", e.target.value)} style={inp}>
            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f9fafb", borderRadius: 8 }}>
          <input type="checkbox" id="disc" checked={draftSettings.enableDiscount}
            onChange={(e) => set("enableDiscount", e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "#1e3a5f" }} />
          <label htmlFor="disc" style={{ fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Enable Discount Field</label>
        </div>
      </div>

      {/* Change PINs */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🔐 Change PINs</div>
        {[["Admin PIN", newAdminPin, setNewAdminPin], ["Staff PIN", newStaffPin, setNewStaffPin]].map(([l, val, setter]) => (
          <div key={l} style={{ marginBottom: 12 }}>
            <label style={lbl}>New {l}</label>
            <input type="password" maxLength={4} value={val}
              onChange={(e) => setter(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••" style={{ ...inp, width: 140, letterSpacing: 8, fontSize: 20 }} inputMode="numeric" />
          </div>
        ))}
      </div>

      <button onClick={onSave}
        style={{ width: "100%", padding: "14px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>
        💾 Save Settings
      </button>
    </>
  );
}
