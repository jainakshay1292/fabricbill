import { useState, useEffect, useCallback, useRef } from "react";
import {
  loginWithPin, getSettings, saveSettings,
  getTransactions, insertTransaction, updateTransaction, validateInvoiceEdit,
  getCustomers, upsertCustomer,
  getProducts, insertProduct, updateProduct, deleteProduct,
  getNextInvoiceNo, registerShop, hashPin,
} from "./lib/api";

// ── Constants & Helpers ───────────────────────────────────────────────────
const PAYMENT_MODES = ["Cash", "UPI", "Card", "Credit"];
const defaultSettings = {
  shopName: "MY SHOP", shopTagline: "", shopAddress: "", shopPhone: "",
  gstin: "", stateCode: "", footerNote: "", signoff: "For MY SHOP",
  gstLow: 5, gstHigh: 18, gstThreshold: 2500,
  currency: "₹", enableDiscount: true, defaultPaymentMode: "Cash",
  adminPinHash: "", staffPinHash: "",
};
const fmt = (n, cur = "₹") => cur + Number(n).toFixed(2);
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const card = { background: "#fff", borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" };
const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 };

// ── ShopCodeScreen ────────────────────────────────────────────────────────
function ShopCodeScreen({ onEnter }) {
  const [code, setCode] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>🧵</div>
          <div style={{ fontWeight: 800, fontSize: 24, color: "#1e3a5f" }}>FabricBill</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Smart Billing for Fabric Shops</div>
        </div>
        <label style={lbl}>Shop Code</label>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
          placeholder="e.g. MEGHDOOT2024" style={{ ...inp, marginBottom: 16, letterSpacing: 2, fontWeight: 700, textAlign: "center" }} />
        <button onClick={() => code.length >= 4 && onEnter(code)}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          Enter Shop →
        </button>
      </div>
    </div>
  );
}

// ── LoginScreen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin, settings, shopCode, onChangeShop }) {
  const [role, setRole] = useState("staff");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (pin.length < 4) return setErr("Enter 4-digit PIN");
    setLoading(true); setErr("");
    try {
      await loginWithPin(shopCode, role, pin);
      onLogin(role);
    } catch (e) {
      setErr(e.message || "Wrong PIN");
    } finally { setLoading(false); setPin(""); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#1e3a5f" }}>{settings.shopName}</div>
          <div style={{ background: "#e0f2fe", display: "inline-block", borderRadius: 20, padding: "2px 12px", fontSize: 12, color: "#0369a1", marginTop: 4 }}>🏪 {shopCode}</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["staff", "admin"].map(r => (
            <button key={r} onClick={() => { setRole(r); setPin(""); setErr(""); }}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: role === r ? "#1e3a5f" : "#f3f4f6", color: role === r ? "#fff" : "#374151" }}>
              {r === "admin" ? "🔐 Admin" : "👤 Staff"}
            </button>
          ))}
        </div>
        <input type="password" maxLength={4} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="Enter PIN" inputMode="numeric"
          style={{ ...inp, letterSpacing: 10, fontSize: 22, textAlign: "center", marginBottom: 8 }} />
        {err && <div style={{ color: "#dc2626", fontSize: 13, textAlign: "center", marginBottom: 8 }}>{err}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>
          {loading ? "Checking…" : "Login →"}
        </button>
        <button onClick={onChangeShop} style={{ width: "100%", padding: "10px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
          ← Change Shop
        </button>
      </div>
    </div>
  );
}

// ── RegisterScreen ────────────────────────────────────────────────────────
function RegisterScreen({ shopCode, onRegistered }) {
  const [form, setForm] = useState({ shopName: "", adminPin: "", staffPin: "" });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleRegister = async () => {
    if (!form.shopName.trim() || form.adminPin.length < 4 || form.staffPin.length < 4)
      return alert("Fill all fields with 4-digit PINs");
    setLoading(true);
    try {
      const adminPinHash = await hashPin(form.adminPin);
      const staffPinHash = await hashPin(form.staffPin);
      await registerShop(shopCode, { ...defaultSettings, shopName: form.shopName, adminPinHash, staffPinHash });
      onRegistered();
    } catch (e) { alert("Registration failed: " + e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>🏪</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#1e3a5f" }}>Register Shop</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Shop Code: <b>{shopCode}</b></div>
        </div>
        {[["shopName", "Shop Name", "text", "My Fabric Shop"],
          ["adminPin", "Admin PIN (4 digits)", "password", "••••"],
          ["staffPin", "Staff PIN (4 digits)", "password", "••••"]].map(([k, l, t, ph]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={lbl}>{l}</label>
            <input type={t} maxLength={k.includes("Pin") ? 4 : 60} value={form[k]}
              onChange={e => set(k, k.includes("Pin") ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value)}
              placeholder={ph} inputMode={k.includes("Pin") ? "numeric" : "text"} style={inp} />
          </div>
        ))}
        <button onClick={handleRegister} disabled={loading}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          {loading ? "Registering…" : "Register & Start →"}
        </button>
      </div>
    </div>
  );
}

// ── InvoiceView ───────────────────────────────────────────────────────────
function InvoiceView({ txn, settings, onClose }) {
  const [showBt, setShowBt] = useState(false);
  const s = settings;

  const doThermal = () => {
    const w = 32;
    const line = (l = "", r = "", width = w) => {
      const gap = width - l.length - r.length;
      return l + (gap > 0 ? " ".repeat(gap) : " ") + r;
    };
    const div = "─".repeat(w);
    let out = s.shopName.toUpperCase().padStart((w + s.shopName.length) / 2).slice(0, w) + "\n";
    if (s.shopAddress) out += s.shopAddress.slice(0, w).padStart((w + Math.min(s.shopAddress.length, w)) / 2) + "\n";
    if (s.shopPhone) out += ("Ph: " + s.shopPhone).padStart((w + ("Ph: " + s.shopPhone).length) / 2) + "\n";
    if (s.gstin) out += ("GSTIN: " + s.gstin) + "\n";
    out += div + "\n";
    out += line("Invoice: " + (txn.invoiceNo || "-"), new Date(txn.date).toLocaleDateString("en-IN")) + "\n";
    out += "Customer: " + (txn.customerName || "Walk-in") + "\n";
    out += div + "\n";
    txn.items.forEach(it => {
      const nm = it.name.slice(0, 18);
      out += line(nm, fmt(it.total, s.currency)) + "\n";
      out += `  ${it.meters}m x ${fmt(it.rate, s.currency)}/m\n`;
    });
    out += div + "\n";
    if (txn.discount > 0) out += line("Discount", "-" + fmt(txn.discount, s.currency)) + "\n";
    out += line("Taxable", fmt(txn.taxable, s.currency)) + "\n";
    out += line("GST (" + txn.gstRate + "%)", fmt(txn.gstAmt, s.currency)) + "\n";
    out += div + "\n";
    out += line("TOTAL", fmt(txn.net, s.currency)) + "\n";
    out += div + "\n";
    if (txn.splitPayment) {
      PAYMENT_MODES.forEach(m => { if (txn.splitPayment[m] > 0) out += line(m, fmt(txn.splitPayment[m], s.currency)) + "\n"; });
    } else { out += line(txn.paymentMode || "Cash", fmt(txn.net, s.currency)) + "\n"; }
    if (s.footerNote) out += "\n" + s.footerNote.slice(0, w) + "\n";
    return out;
  };

  const doWhatsApp = () => {
    const lines = [`*${s.shopName}*`, s.shopAddress, `Ph: ${s.shopPhone}`, s.gstin ? `GSTIN: ${s.gstin}` : "",
      `\n*Invoice:* ${txn.invoiceNo || "-"}   *Date:* ${new Date(txn.date).toLocaleDateString("en-IN")}`,
      `*Customer:* ${txn.customerName || "Walk-in"}\n`, "─────────────────"];
    txn.items.forEach(it => lines.push(`*${it.name}*\n  ${it.meters}m × ${fmt(it.rate, s.currency)}/m = ${fmt(it.total, s.currency)}`));
    lines.push("─────────────────");
    if (txn.discount > 0) lines.push(`Discount: -${fmt(txn.discount, s.currency)}`);
    lines.push(`Taxable: ${fmt(txn.taxable, s.currency)}`, `GST (${txn.gstRate}%): ${fmt(txn.gstAmt, s.currency)}`, `*TOTAL: ${fmt(txn.net, s.currency)}*`);
    if (s.footerNote) lines.push("\n" + s.footerNote);
    return lines.filter(Boolean).join("\n");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1e3a5f" }}>{s.shopName}</div>
          {s.shopAddress && <div style={{ fontSize: 12, color: "#6b7280" }}>{s.shopAddress}</div>}
          {s.shopPhone && <div style={{ fontSize: 12, color: "#6b7280" }}>Ph: {s.shopPhone}</div>}
          {s.gstin && <div style={{ fontSize: 11, color: "#6b7280" }}>GSTIN: {s.gstin}</div>}
        </div>
        <div style={{ borderTop: "1px dashed #d1d5db", borderBottom: "1px dashed #d1d5db", padding: "8px 0", marginBottom: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span><b>Invoice:</b> {txn.invoiceNo || "-"}</span>
          <span>{new Date(txn.date).toLocaleDateString("en-IN")}</span>
        </div>
        <div style={{ fontSize: 13, marginBottom: 8 }}><b>Customer:</b> {txn.customerName || "Walk-in"}</div>
        {txn.items.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
            <div><b>{it.name}</b><div style={{ fontSize: 11, color: "#6b7280" }}>{it.meters}m × {fmt(it.rate, s.currency)}/m</div></div>
            <div style={{ fontWeight: 700 }}>{fmt(it.total, s.currency)}</div>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 13 }}>
          {txn.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Discount</span><span style={{ color: "#dc2626" }}>-{fmt(txn.discount, s.currency)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Taxable</span><span>{fmt(txn.taxable, s.currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>GST ({txn.gstRate}%)</span><span>{fmt(txn.gstAmt, s.currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, marginTop: 6, borderTop: "2px solid #1e3a5f", paddingTop: 6 }}>
            <span>TOTAL</span><span>{fmt(txn.net, s.currency)}</span>
          </div>
        </div>
        {txn.splitPayment
          ? <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>{PAYMENT_MODES.filter(m => txn.splitPayment[m] > 0).map(m => `${m}: ${fmt(txn.splitPayment[m], s.currency)}`).join(" | ")}</div>
          : <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>Payment: {txn.paymentMode}</div>}
        {s.footerNote && <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 10 }}>{s.footerNote}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => { const ph = txn.customerPhone?.replace(/\D/g, ""); window.open(`https://wa.me/91${ph}?text=${encodeURIComponent(doWhatsApp())}`, "_blank"); }}
            style={{ flex: 1, padding: "12px 0", background: "#25d366", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>📲 WhatsApp</button>
          <button onClick={() => setShowBt(true)}
            style={{ flex: 1, padding: "12px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>🖨️ Thermal</button>
          <button onClick={onClose}
            style={{ flex: 1, padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✖ Close</button>
        </div>
        {showBt && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
            <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 8 }}>📲 Thermal Print</div>
              <pre style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 11, overflowX: "auto", marginBottom: 12, maxHeight: 280, overflowY: "auto", whiteSpace: "pre-wrap" }}>{doThermal()}</pre>
              <button onClick={() => navigator.clipboard.writeText(doThermal()).then(() => alert("Copied!"))}
                style={{ width: "100%", padding: "12px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>📋 Copy</button>
              <button onClick={() => setShowBt(false)}
                style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EditInvoiceModal ──────────────────────────────────────────────────────
function EditInvoiceModal({ txn, products, settings, onSave, onCancel, onVoidInvoice }) {
  const [items, setItems] = useState(txn.items.map(i => ({ ...i })));
  const [discount, setDiscount] = useState(txn.discount || 0);
  const [paymentMode, setPaymentMode] = useState(txn.paymentMode || "Cash");
  const s = settings;

  const totals = (() => {
    const sub = items.reduce((a, it) => a + (parseFloat(it.meters) || 0) * (parseFloat(it.rate) || 0), 0);
    const disc = Math.min(parseFloat(discount) || 0, sub);
    const taxable = sub - disc;
    const gstRate = taxable >= s.gstThreshold ? s.gstHigh : s.gstLow;
    const gstAmt = +(taxable * gstRate / 100).toFixed(2);
    return { sub, disc, taxable, gstRate, gstAmt, net: +(taxable + gstAmt).toFixed(2) };
  })();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e3a5f", marginBottom: 12 }}>✏️ Edit Invoice {txn.invoiceNo}</div>
        {items.map((it, i) => (
          <div key={i} style={{ ...card, padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{it.name}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Meters</label><input type="number" value={it.meters} onChange={e => { const n = [...items]; n[i].meters = e.target.value; n[i].total = +(parseFloat(e.target.value) * parseFloat(n[i].rate)).toFixed(2); setItems(n); }} style={inp} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Rate</label><input type="number" value={it.rate} onChange={e => { const n = [...items]; n[i].rate = e.target.value; n[i].total = +(parseFloat(n[i].meters) * parseFloat(e.target.value)).toFixed(2); setItems(n); }} style={inp} /></div>
            </div>
          </div>
        ))}
        {s.enableDiscount && <div style={{ marginBottom: 12 }}><label style={lbl}>Discount (₹)</label><input type="number" value={discount} onChange={e => setDiscount(e.target.value)} style={inp} /></div>}
        <div style={{ marginBottom: 12 }}><label style={lbl}>Payment Mode</label>
          <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} style={inp}>
            {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Taxable</span><span>{fmt(totals.taxable, s.currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>GST ({totals.gstRate}%)</span><span>{fmt(totals.gstAmt, s.currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 15 }}><span>NET</span><span>{fmt(totals.net, s.currency)}</span></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onSave({ ...txn, items, discount: totals.disc, taxable: totals.taxable, gstRate: totals.gstRate, gstAmt: totals.gstAmt, net: totals.net, paymentMode })}
            style={{ flex: 2, padding: "13px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>💾 Save</button>
          <button onClick={onVoidInvoice}
            style={{ flex: 1, padding: "13px 0", background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>🗑️ Void</button>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── CreditCustomerModal ───────────────────────────────────────────────────
function CreditCustomerModal({ customers, onConfirm, onCancel, netAmount, currency }) {
  const [sel, setSel] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 340 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 4 }}>💳 Credit to Customer</div>
        <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>Amount: <b>{fmt(netAmount, currency)}</b></div>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inp, marginBottom: 14 }}>
          <option value="">— Select Customer —</option>
          {customers.filter(c => c.id !== "c1").map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => sel && onConfirm(customers.find(c => c.id === sel))} disabled={!sel}
            style={{ flex: 1, padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>Confirm</button>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "12px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [shopCode, setShopCode] = useState(() => { try { return localStorage.getItem("fabricbill_shopcode") || null; } catch { return null; } });
  const [ready, setReady] = useState(false);
  const [isNewShop, setIsNewShop] = useState(false);
  const [role, setRole] = useState(() => {
    try {
      const s = localStorage.getItem("fabricbill_session");
      if (!s) return null;
      const { role, expiry } = JSON.parse(s);
      return Date.now() < expiry ? role : null;
    } catch { return null; }
  });
  const [tab, setTab] = useState("billing");
  const [settings, setSettings] = useState(defaultSettings);
  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Billing state
  const [selectedCustomer, setSelectedCustomer] = useState("c1");
  const [items, setItems] = useState([{ id: genId(), name: "", meters: "", rate: "", total: 0 }]);
  const [discount, setDiscount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [splitPayment, setSplitPayment] = useState({});
  const [useSplit, setUseSplit] = useState(false);
  const [showReceipt, setShowReceipt] = useState(null);
  const [editTxn, setEditTxn] = useState(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [draftSettings, setDraftSettings] = useState(defaultSettings);
  const [newAdminPin, setNewAdminPin] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");

  // Products state
  const [newProd, setNewProd] = useState({ name: "", rate: "" });
  const [editProdId, setEditProdId] = useState(null);

  // Customers state
  const [newCust, setNewCust] = useState({ name: "", phone: "" });
  const [histFilter, setHistFilter] = useState("all");
  const [histSearch, setHistSearch] = useState("");

  // Voice
  const recognizerRef = useRef(null);
  const [voiceActive, setVoiceActive] = useState(false);

  const isAdmin = role === "admin";

  // ── Load shop data ────────────────────────────────────────
  useEffect(() => {
    if (!shopCode) return;
    (async () => {
      try {
        const s = await getSettings(shopCode);
        if (!s) { setIsNewShop(true); setReady(true); return; }
        setSettings({ ...defaultSettings, ...s });
        setDraftSettings({ ...defaultSettings, ...s });
        const [txns, custs, prods] = await Promise.all([getTransactions(shopCode), getCustomers(shopCode), getProducts(shopCode)]);
        setTransactions(txns || []);
        setCustomers(custs?.length ? custs : [{ id: "c1", name: "Walk-in Customer", phone: "" }]);
        setProducts(prods || []);
        setIsNewShop(false);
      } catch { setIsNewShop(true); }
      setReady(true);
    })();
  }, [shopCode]);

  // ── Billing calculations ──────────────────────────────────
  const sub = items.reduce((a, it) => a + (parseFloat(it.meters) || 0) * (parseFloat(it.rate) || 0), 0);
  const disc = Math.min(parseFloat(discount) || 0, sub);
  const taxable = sub - disc;
  const gstRate = taxable >= settings.gstThreshold ? settings.gstHigh : settings.gstLow;
  const gstAmt = +(taxable * gstRate / 100).toFixed(2);
  const netAmount = +(taxable + gstAmt).toFixed(2);

  const splitTotal = Object.values(splitPayment).reduce((a, v) => a + (parseFloat(v) || 0), 0);

  const handleAddItem = () => setItems(p => [...p, { id: genId(), name: "", meters: "", rate: "", total: 0 }]);
  const handleRemoveItem = (idx) => setItems(p => p.filter((_, i) => i !== idx));
  const handleItemChange = (idx, field, val) => {
    setItems(p => {
      const n = p.map((it, i) => {
        if (i !== idx) return it;
        const u = { ...it, [field]: val };
        if (field === "name") {
          const found = products.find(pr => pr.name.toLowerCase() === val.toLowerCase());
          if (found) u.rate = found.rate;
        }
        u.total = +((parseFloat(u.meters) || 0) * (parseFloat(u.rate) || 0)).toFixed(2);
        return u;
      });
      return n;
    });
  };

  // ── Voice input ───────────────────────────────────────────
  const handleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Voice not supported on this browser");
    if (voiceActive) { recognizerRef.current?.stop(); setVoiceActive(false); return; }
    const r = new SR();
    r.lang = "en-IN"; r.interimResults = false;
    r.onresult = (e) => {
      const txt = e.results[0][0].transcript.toLowerCase();
      // Parse "fabric name meters rate" e.g. "silk saree 2.5 meters 800"
      const m = txt.match(/(.+?)\s+(\d+(?:\.\d+)?)\s*(?:meters?|मीटर)?\s+(\d+(?:\.\d+)?)/i);
      if (m) {
        const [, name, meters, rate] = m;
        setItems(p => [...p.filter(it => it.name), { id: genId(), name: name.trim(), meters, rate, total: +(parseFloat(meters) * parseFloat(rate)).toFixed(2) }]);
      } else alert("Could not parse. Say: 'silk 2 meters 800'");
    };
    r.onend = () => setVoiceActive(false);
    r.start();
    recognizerRef.current = r;
    setVoiceActive(true);
  };

  // ── Save bill ─────────────────────────────────────────────
  const handleSaveBill = async () => {
    const validItems = items.filter(it => it.name && parseFloat(it.meters) > 0 && parseFloat(it.rate) > 0);
    if (!validItems.length) return alert("Add at least one valid item");
    if (useSplit && Math.abs(splitTotal - netAmount) > 0.5) return alert(`Split total (${fmt(splitTotal, settings.currency)}) must equal net (${fmt(netAmount, settings.currency)})`);
    setSaving(true);
    try {
      const invoiceNo = await getNextInvoiceNo(shopCode);
      const cust = customers.find(c => c.id === selectedCustomer) || customers[0];
      const txn = {
        id: genId(), invoiceNo, date: new Date().toISOString(),
        customerId: cust.id, customerName: cust.name, customerPhone: cust.phone || "",
        items: validItems, discount: disc, taxable, gstRate, gstAmt, net: netAmount,
        paymentMode: useSplit ? "Split" : paymentMode,
        splitPayment: useSplit ? { ...splitPayment } : null,
        createdBy: role, voided: false,
      };
      if (paymentMode === "Credit" && !useSplit) {
        setShowCreditModal(true);
        setSaving(false);
        // Save txn after credit confirmation
        window._pendingTxn = txn;
        return;
      }
      await insertTransaction(shopCode, txn);
      setTransactions(p => [txn, ...p]);
      setShowReceipt(txn);
      resetBilling();
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  const handleConfirmPayment = async (cust) => {
    const txn = window._pendingTxn;
    if (!txn) return;
    txn.customerId = cust.id; txn.customerName = cust.name; txn.customerPhone = cust.phone || "";
    await insertTransaction(shopCode, txn);
    // Update customer credit balance
    const updCust = { ...cust, creditBalance: (parseFloat(cust.creditBalance) || 0) + txn.net };
    await upsertCustomer(shopCode, updCust);
    setCustomers(p => p.map(c => c.id === updCust.id ? updCust : c));
    setTransactions(p => [txn, ...p]);
    setShowReceipt(txn);
    setShowCreditModal(false);
    window._pendingTxn = null;
    resetBilling();
  };

  const resetBilling = () => {
    setItems([{ id: genId(), name: "", meters: "", rate: "", total: 0 }]);
    setDiscount(""); setPaymentMode(settings.defaultPaymentMode || "Cash");
    setSplitPayment({}); setUseSplit(false); setSelectedCustomer("c1");
  };

  // ── Edit invoice ──────────────────────────────────────────
  const handleEditClick = async (txn) => {
    try {
      await validateInvoiceEdit(shopCode, txn.id);
      setEditTxn(txn);
    } catch (e) { alert(e.message); }
  };

  const handleEditSave = async (updated) => {
    try {
      await updateTransaction(shopCode, updated);
      setTransactions(p => p.map(t => t.id === updated.id ? updated : t));
      setEditTxn(null);
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const handleVoidInvoice = async (txn) => {
    if (!window.confirm("Void this invoice? This cannot be undone.")) return;
    const voided = { ...txn, voided: true };
    await updateTransaction(shopCode, voided);
    setTransactions(p => p.map(t => t.id === voided.id ? voided : t));
    setEditTxn(null);
  };

  // ── Save settings ─────────────────────────────────────────
  const handleSaveSettings = async () => {
    try {
      const updated = { ...draftSettings };
      if (newAdminPin.length === 4) updated.adminPinHash = await hashPin(newAdminPin);
      if (newStaffPin.length === 4) updated.staffPinHash = await hashPin(newStaffPin);
      await saveSettings(shopCode, updated);
      setSettings(updated); setNewAdminPin(""); setNewStaffPin("");
      alert("Settings saved ✅");
    } catch (e) { alert("Save failed: " + e.message); }
  };

  // ── History filters ───────────────────────────────────────
  const filteredTxns = transactions.filter(t => {
    if (t.voided) return false;
    if (histSearch) {
      const s = histSearch.toLowerCase();
      return t.customerName?.toLowerCase().includes(s) || t.invoiceNo?.toLowerCase().includes(s);
    }
    if (histFilter === "today") return new Date(t.date).toDateString() === new Date().toDateString();
    if (histFilter === "week") return Date.now() - new Date(t.date) < 7 * 86400000;
    if (histFilter === "month") return Date.now() - new Date(t.date) < 30 * 86400000;
    return true;
  });

  const totalRevenue = filteredTxns.reduce((a, t) => a + t.net, 0);

  // ── Export CSV ────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = [["Invoice No","Date","Customer","Items","Taxable","GST","Discount","Net Amount","Payment Mode","Credit Due"]];
    filteredTxns.forEach(t => {
      rows.push([t.invoiceNo||"-", new Date(t.date).toLocaleDateString("en-IN"), t.customerName||"Walk-in",
        t.items.map(i => `${i.name}(${i.meters}m@${i.rate})`).join("; "),
        t.taxable, t.gstAmt, t.discount||0, t.net,
        t.splitPayment ? Object.entries(t.splitPayment).filter(([,v])=>v>0).map(([k,v])=>`${k}:${v}`).join("+") : (t.paymentMode||"Cash"),
        ""]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `fabricbill_${histFilter}_${Date.now()}.csv`; a.click();
  };

  // ── Screens ───────────────────────────────────────────────
  if (!shopCode) return <ShopCodeScreen onEnter={code => { setShopCode(code); try { localStorage.setItem("fabricbill_shopcode", code); } catch {} }} />;
  if (!ready) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12, background: "#f3f4f6" }}>
      <div style={{ fontSize: 36 }}>🧵</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: "#1e3a5f" }}>FabricBill</div>
      <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading {shopCode}…</div>
    </div>
  );
  if (isNewShop) return <RegisterScreen shopCode={shopCode} onRegistered={() => { setIsNewShop(false); setReady(false); setShopCode(s => s); }} />;
  if (!role) return <LoginScreen onLogin={r => { setRole(r); try { localStorage.setItem("fabricbill_session", JSON.stringify({ role: r, expiry: Date.now() + 24 * 3600000 })); } catch {} }} settings={settings} shopCode={shopCode} onChangeShop={() => { setShopCode(null); setReady(false); try { localStorage.removeItem("fabricbill_shopcode"); } catch {} }} />;

  const navTabs = isAdmin
    ? [["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"],["products","📦","Products"],["settings","⚙️","Settings"]]
    : [["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"]];

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", background: "#f3f4f6", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "#1e3a5f", color: "#fff", padding: "14px 16px", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{settings.shopName}</div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 1 }}>🏪 {shopCode} · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ background: isAdmin ? "#fbbf24" : "#34d399", color: "#1e3a5f", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800 }}>{isAdmin ? "🔐 Admin" : "👤 Staff"}</span>
          <button onClick={() => { setRole(null); try { localStorage.removeItem("fabricbill_session"); } catch {} }}
            style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "#fff", padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: "14px 12px" }}>

        {/* ── BILLING TAB ── */}
        {tab === "billing" && (
          <>
            <div style={card}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ ...inp, flex: 1, margin: 0 }}>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
                </select>
                <button onClick={handleVoice} style={{ padding: "10px 14px", background: voiceActive ? "#dc2626" : "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 18, cursor: "pointer" }}>
                  {voiceActive ? "⏹" : "🎤"}
                </button>
              </div>
              {items.map((it, idx) => (
                <div key={it.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <input list="prod-list" value={it.name} onChange={e => handleItemChange(idx, "name", e.target.value)} placeholder="Fabric name" style={{ ...inp, flex: 1 }} />
                    {items.length > 1 && <button onClick={() => handleRemoveItem(idx)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>}
                  </div>
                  <datalist id="prod-list">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" value={it.meters} onChange={e => handleItemChange(idx, "meters", e.target.value)} placeholder="Meters" inputMode="decimal" style={{ ...inp, flex: 1 }} />
                    <input type="number" value={it.rate} onChange={e => handleItemChange(idx, "rate", e.target.value)} placeholder="Rate/m" inputMode="decimal" style={{ ...inp, flex: 1 }} />
                    <div style={{ padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#1e3a5f", minWidth: 60, textAlign: "right" }}>{it.total > 0 ? fmt(it.total, settings.currency) : ""}</div>
                  </div>
                </div>
              ))}
              <button onClick={handleAddItem} style={{ width: "100%", padding: "8px 0", background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>+ Add Item</button>

              {settings.enableDiscount && (
                <div style={{ marginBottom: 8 }}>
                  <label style={lbl}>Discount (₹)</label>
                  <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" inputMode="decimal" style={inp} />
                </div>
              )}

              <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13 }}>
                {disc > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Discount</span><span style={{ color: "#dc2626" }}>-{fmt(disc, settings.currency)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Taxable</span><span>{fmt(taxable, settings.currency)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>GST ({gstRate}%)</span><span>{fmt(gstAmt, settings.currency)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, marginTop: 4, borderTop: "1px solid #d1fae5", paddingTop: 4 }}><span>NET</span><span>{fmt(netAmount, settings.currency)}</span></div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={useSplit} onChange={e => setUseSplit(e.target.checked)} />
                  Split Payment
                </label>
              </div>
              {useSplit ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {PAYMENT_MODES.map(m => (
                    <div key={m} style={{ flex: "1 1 calc(50% - 6px)" }}>
                      <label style={lbl}>{m}</label>
                      <input type="number" value={splitPayment[m] || ""} onChange={e => setSplitPayment(p => ({ ...p, [m]: e.target.value }))} placeholder="0" inputMode="decimal" style={inp} />
                    </div>
                  ))}
                  <div style={{ width: "100%", fontSize: 12, color: Math.abs(splitTotal - netAmount) < 0.5 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                    Split Total: {fmt(splitTotal, settings.currency)} / {fmt(netAmount, settings.currency)}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {PAYMENT_MODES.map(m => (
                    <button key={m} onClick={() => setPaymentMode(m)}
                      style={{ flex: "1 1 calc(50% - 6px)", padding: "8px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: paymentMode === m ? "#1e3a5f" : "#f3f4f6", color: paymentMode === m ? "#fff" : "#374151" }}>
                      {m}
                    </button>
                  ))}
                </div>
              )}

              <button onClick={handleSaveBill} disabled={saving}
                style={{ width: "100%", padding: "14px 0", background: saving ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                {saving ? "Saving…" : `💾 Save Bill — ${fmt(netAmount, settings.currency)}`}
              </button>
            </div>
          </>
        )}

        {/* ── CUSTOMERS TAB ── */}
        {tab === "customers" && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 10 }}>➕ Add Customer</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={newCust.name} onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))} placeholder="Name" style={{ ...inp, flex: 2 }} />
                <input value={newCust.phone} onChange={e => setNewCust(p => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="Phone" inputMode="tel" style={{ ...inp, flex: 1 }} />
              </div>
              <button onClick={async () => {
                if (!newCust.name.trim()) return;
                const c = { id: genId(), name: newCust.name.trim(), phone: newCust.phone, creditBalance: 0 };
                await upsertCustomer(shopCode, c);
                setCustomers(p => [...p, c]); setNewCust({ name: "", phone: "" });
              }} style={{ width: "100%", padding: "10px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
            {customers.filter(c => c.id !== "c1").map(c => (
              <div key={c.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 12, color: "#6b7280" }}>{c.phone}</div>}
                  {(c.creditBalance || 0) > 0 && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>Credit: {fmt(c.creditBalance, settings.currency)}</div>}
                </div>
                {(c.creditBalance || 0) > 0 && isAdmin && (
                  <button onClick={async () => {
                    const amt = parseFloat(prompt(`Settle how much credit for ${c.name}? (Balance: ${fmt(c.creditBalance, settings.currency)})`));
                    if (!amt || amt <= 0) return;
                    const upd = { ...c, creditBalance: Math.max(0, c.creditBalance - amt) };
                    await upsertCustomer(shopCode, upd);
                    setCustomers(p => p.map(x => x.id === upd.id ? upd : x));
                  }} style={{ padding: "6px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Settle
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <>
            <div style={card}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {["all","today","week","month"].map(f => (
                  <button key={f} onClick={() => setHistFilter(f)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: histFilter === f ? "#1e3a5f" : "#f3f4f6", color: histFilter === f ? "#fff" : "#374151" }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="🔍 Search customer / invoice…" style={{ ...inp, marginBottom: 8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>{filteredTxns.length} bills · Total: <b>{fmt(totalRevenue, settings.currency)}</b></div>
                {isAdmin && <button onClick={handleExportCSV} style={{ padding: "5px 12px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>⬇ CSV</button>}
              </div>
            </div>
            {filteredTxns.map(t => (
              <div key={t.id} style={{ ...card, cursor: "pointer" }} onClick={() => setShowReceipt(t)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.customerName || "Walk-in"}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{t.invoiceNo} · {new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{t.items.map(i => i.name).join(", ").slice(0, 40)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#1e3a5f" }}>{fmt(t.net, settings.currency)}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{t.paymentMode}</div>
                    {isAdmin && <button onClick={e => { e.stopPropagation(); handleEditClick(t); }}
                      style={{ marginTop: 4, padding: "3px 8px", background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── PRODUCTS TAB (Admin only) ── */}
        {tab === "products" && isAdmin && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 10 }}>➕ Add Product</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={newProd.name} onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))} placeholder="Fabric name" style={{ ...inp, flex: 2 }} />
                <input type="number" value={newProd.rate} onChange={e => setNewProd(p => ({ ...p, rate: e.target.value }))} placeholder="Rate/m" inputMode="decimal" style={{ ...inp, flex: 1 }} />
              </div>
              <button onClick={async () => {
                if (!newProd.name.trim() || !newProd.rate) return;
                const p = { id: genId(), name: newProd.name.trim(), rate: parseFloat(newProd.rate) };
                await insertProduct(shopCode, p);
                setProducts(prev => [...prev, p]); setNewProd({ name: "", rate: "" });
              }} style={{ width: "100%", padding: "10px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
            {products.map(p => (
              <div key={p.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {editProdId === p.id ? (
                  <div style={{ flex: 1, display: "flex", gap: 6 }}>
                    <input value={p.name} onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))} style={{ ...inp, flex: 2 }} />
                    <input type="number" value={p.rate} onChange={e => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, rate: parseFloat(e.target.value) } : x))} style={{ ...inp, flex: 1 }} />
                    <button onClick={async () => { await updateProduct(shopCode, p); setEditProdId(null); }}
                      style={{ padding: "6px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>✓</button>
                  </div>
                ) : (
                  <>
                    <div><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 12, color: "#6b7280" }}>{fmt(p.rate, settings.currency)}/m</div></div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setEditProdId(p.id)} style={{ padding: "5px 10px", background: "#e0f2fe", color: "#0369a1", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✏️</button>
                      <button onClick={async () => { if (!window.confirm("Delete?")) return; await deleteProduct(shopCode, p.id); setProducts(prev => prev.filter(x => x.id !== p.id)); }}
                        style={{ padding: "5px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── SETTINGS TAB (Admin only) ── */}
        {tab === "settings" && isAdmin && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🏪 Shop Details</div>
              {[["shopName","Shop Name"],["shopTagline","Tagline"],["shopAddress","Address"],["shopPhone","Phone"],["gstin","GSTIN"],["stateCode","State Code"],["footerNote","Footer Note"],["signoff","Sign-off Text"]].map(([k, l]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={lbl}>{l}</label>
                  <input value={draftSettings[k] || ""} onChange={e => setDraftSettings(p => ({ ...p, [k]: e.target.value }))} style={inp} />
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🧾 GST & Billing</div>
              {[["gstLow","GST Low Rate (%)"],["gstHigh","GST High Rate (%)"],["gstThreshold","GST Threshold (₹)"]].map(([k, l]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={lbl}>{l}</label>
                  <input type="number" value={draftSettings[k] || ""} onChange={e => setDraftSettings(p => ({ ...p, [k]: parseFloat(e.target.value) }))} style={inp} />
                </div>
              ))}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Default Payment Mode</label>
                <select value={draftSettings.defaultPaymentMode || "Cash"} onChange={e => setDraftSettings(p => ({ ...p, defaultPaymentMode: e.target.value }))} style={inp}>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={draftSettings.enableDiscount || false} onChange={e => setDraftSettings(p => ({ ...p, enableDiscount: e.target.checked }))} />
                Enable Discount Field
              </label>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🔐 Change PINs</div>
              {[["adminPin","New Admin PIN",newAdminPin,setNewAdminPin],["staffPin","New Staff PIN",newStaffPin,setNewStaffPin]].map(([k, l, val, setter]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <label style={lbl}>{l}</label>
                  <input type="password" maxLength={4} value={val} onChange={e => setter(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="Leave blank to keep current" style={{ ...inp, width: 140, letterSpacing: 6, fontSize: 18 }} inputMode="numeric" />
                </div>
              ))}
            </div>
            <button onClick={handleSaveSettings}
              style={{ width: "100%", padding: "14px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>
              💾 Save Settings
            </button>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", zIndex: 50 }}>
        {navTabs.map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: "10px 0", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: tab === key ? "#1e3a5f" : "#9ca3af" }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: tab === key ? 800 : 500 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Modals */}
      {showReceipt && <InvoiceView txn={showReceipt} settings={settings} onClose={() => setShowReceipt(null)} />}
      {editTxn && <EditInvoiceModal txn={editTxn} products={products} settings={settings} onSave={handleEditSave} onCancel={() => setEditTxn(null)} onVoidInvoice={() => handleVoidInvoice(editTxn)} />}
      {showCreditModal && <CreditCustomerModal customers={customers} onConfirm={handleConfirmPayment} onCancel={() => setShowCreditModal(false)} netAmount={netAmount} currency={settings.currency} />}
    </div>
  );
}
