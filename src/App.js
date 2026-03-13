import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  loginWithPin, getSettings, saveSettings,
  getTransactions, insertTransaction, updateTransaction, validateInvoiceEdit,
  getCustomers, upsertCustomer,
  getProducts, insertProduct, updateProduct, deleteProduct,
  getNextInvoiceNo, registerShop, hashPin,
  getSettlements, insertSettlement, getNextVoucherNo,
} from "./lib/api";

// ── Constants & Helpers ───────────────────────────────────────────────────
const PAYMENT_MODES = ["Cash", "UPI", "Card", "Credit"];
const GST_RATES = [0, 5, 18];

const defaultSettings = {
  shopName: "MY SHOP", shopTagline: "", shopAddress: "", shopPhone: "",
  gstin: "", stateCode: "", footerNote: "", signoff: "For MY SHOP",
  gstLow: 5, gstHigh: 18, gstThreshold: 2500,
  currency: "₹", enableDiscount: true, defaultPaymentMode: "Cash",
  adminPinHash: "", staffPinHash: "",
};

const fmt = (n, cur = "₹") => cur + Number(n).toFixed(2);
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = (d) => { try { const dt = new Date(d); if (isNaN(dt)) return "-"; return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "-"; } };
const fmtDateTime = (d) => { try { const dt = new Date(d); if (isNaN(dt)) return "-"; return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "-"; } };
const getFinYear = () => { const d = new Date(), y = d.getFullYear(), m = d.getMonth(); const s = m >= 3 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };
const isWithin24Hours = (dateStr) => (Date.now() - new Date(dateStr).getTime()) < 24 * 60 * 60 * 1000;

function numToWords(n) {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  n = Math.round(n);
  if (n === 0) return "Zero";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
  if (n < 1000) return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + numToWords(n%100) : "");
  if (n < 100000) return numToWords(Math.floor(n/1000)) + " Thousand" + (n%1000 ? " " + numToWords(n%1000) : "");
  if (n < 10000000) return numToWords(Math.floor(n/100000)) + " Lakh" + (n%100000 ? " " + numToWords(n%100000) : "");
  return numToWords(Math.floor(n/10000000)) + " Crore" + (n%10000000 ? " " + numToWords(n%10000000) : "");
}

function toCSV(rows, cols) {
  const header = cols.map(c => `"${c.label}"`).join(",");
  const body = rows.map(r => cols.map(c => `"${String(r[c.key] || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return header + "\n" + body;
}
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ────────────────────────────────────────────────────────────────
const card = { background: "#fff", borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" };
const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff" };
const lbl = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 };
const BDR = "1px solid #000";
const tds = e => ({ ...e, border: BDR, padding: "4px 6px", fontSize: 11 });

if (typeof document !== "undefined" && !document.getElementById("fb-style")) {
  const s = document.createElement("style"); s.id = "fb-style";
  s.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'DM Sans', -apple-system, sans-serif; background: #f0f2f5; }
    input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    input[type=number] { -moz-appearance: textfield; }
    button { transition: opacity 0.15s, transform 0.1s; }
    button:active { transform: scale(0.97); opacity: 0.9; }
    input:focus, select:focus { outline: none; border-color: #1e3a5f !important; }
    .day-row { transition: background 0.15s; border-radius: 8px; cursor: pointer; }
    .day-row:hover { background: #f0f2f5; }
  `;
  document.head.appendChild(s);
}

// ── GstSelect ─────────────────────────────────────────────────────────────
const GstSelect = ({ value, onChange }) => (
  <select value={value === null || value === undefined ? "default" : String(value)}
    onChange={e => onChange(e.target.value)}
    style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
    <option value="default">Default</option>
    {GST_RATES.map(v => <option key={v} value={String(v)}>{v}%</option>)}
  </select>
);

// ── buildGstRows ──────────────────────────────────────────────────────────
function buildGstRows(items, taxable, subtotal) {
  const groups = {};
  items.forEach(item => {
    const rate = (item.gstRate * 100).toFixed(1);
    if (!groups[rate]) groups[rate] = 0;
    groups[rate] += item.subtotal;
  });
  return Object.entries(groups).filter(([rate]) => parseFloat(rate) !== 0).map(([rate, amt]) => {
    const share = subtotal > 0 ? amt / subtotal : 0;
    const taxableAmt = Math.round(taxable * share * 100) / 100;
    const gstAmt = Math.round(taxableAmt * parseFloat(rate) / 100 * 100) / 100;
    const half = (parseFloat(rate) / 2).toFixed(1);
    return { rate, half, taxableAmt, cgst: Math.round(gstAmt / 2 * 100) / 100, sgst: Math.round(gstAmt / 2 * 100) / 100 };
  });
}

// ── ShopCodeScreen ────────────────────────────────────────────────────────
function ShopCodeScreen({ onEnter }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const check = async () => {
    if (code.length < 4) return setErr("Min 4 characters");
    setChecking(true); setErr("");
    onEnter(code);
    setChecking(false);
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>🧵</div>
          <div style={{ fontWeight: 800, fontSize: 24, color: "#1e3a5f" }}>FabricBill</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>GST Billing for Fabric Shops</div>
        </div>
        <label style={lbl}>Shop Code</label>
        <input value={code} onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && check()}
          placeholder="e.g. MEGHDOOT2024"
          style={{ ...inp, marginBottom: 8, letterSpacing: 2, fontWeight: 700, textAlign: "center" }} autoFocus />
        {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <button onClick={check} disabled={checking}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          {checking ? "Checking…" : "Enter Shop →"}
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
  const handle = async () => {
    if (!form.shopName.trim() || form.adminPin.length < 4 || form.staffPin.length < 4)
      return alert("Fill all fields with 4-digit PINs");
    setLoading(true);
    try {
      const adminPinHash = await hashPin(form.adminPin);
      const staffPinHash = await hashPin(form.staffPin);
      await registerShop(shopCode, { ...defaultSettings, shopName: form.shopName.trim(), adminPinHash, staffPinHash, signoff: "For " + form.shopName.trim() });
      onRegistered();
    } catch (e) { alert("Registration failed: " + e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 36 }}>🏪</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#1e3a5f" }}>Register Shop</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Code: <b>{shopCode}</b></div>
        </div>
        {[["shopName","Shop Name","text","My Fabric Shop"],["adminPin","Admin PIN (4 digits)","password","••••"],["staffPin","Staff PIN (4 digits)","password","••••"]].map(([k,l,t,ph]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={lbl}>{l}</label>
            <input type={t} maxLength={k.includes("Pin") ? 4 : 60} value={form[k]}
              onChange={e => set(k, k.includes("Pin") ? e.target.value.replace(/\D/g,"").slice(0,4) : e.target.value)}
              placeholder={ph} inputMode={k.includes("Pin") ? "numeric" : "text"} style={inp} />
          </div>
        ))}
        <button onClick={handle} disabled={loading}
          style={{ width: "100%", padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          {loading ? "Registering…" : "Register & Start →"}
        </button>
      </div>
    </div>
  );
}

// ── LoginScreen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin, settings, shopCode, onChangeShop }) {
  const [role, setRole] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (pin.length < 4) return;
    setLoading(true); setErr("");
    try { await loginWithPin(shopCode, role, pin); onLogin(role); }
    catch (e) { setErr(e.message || "Wrong PIN"); setPin(""); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (pin.length === 4) submit(); }, [pin]);
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 4 }}>🧵</div>
      <div style={{ fontWeight: 900, fontSize: 22, color: "#fff", marginBottom: 2 }}>FabricBill</div>
      <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>🏪 {shopCode}</div>
      <button onClick={onChangeShop} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer", marginBottom: 28 }}>← Change Shop</button>
      {!role ? (
        <div style={{ display: "flex", gap: 20 }}>
          {[["admin","🔐","Admin","#1e3a5f"],["staff","👤","Staff","#16a34a"]].map(([r,icon,label,bg]) => (
            <button key={r} onClick={() => { setRole(r); setPin(""); setErr(""); }}
              style={{ width: 136, height: 136, borderRadius: 18, border: "none", background: bg, color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.2)" }}>
              <span style={{ fontSize: 38 }}>{icon}</span><span style={{ fontWeight: 800, fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", width: 290, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>{role === "admin" ? "🔐 Admin" : "👤 Staff"} PIN</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 16, marginTop: 10 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: pin.length > i ? "#1e3a5f" : "#e5e7eb", transition: "background 0.2s" }} />)}
          </div>
          {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 10, background: "#fee2e2", borderRadius: 6, padding: "6px 10px" }}>⚠ {err}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, justifyItems: "center", marginBottom: 12 }}>
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <button key={d} onClick={() => { if (pin.length < 4) setPin(p => p + String(d)); }}
                style={{ width: 66, height: 66, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#1e3a5f", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>{d}</button>
            ))}
            <button onClick={() => setPin(p => p.slice(0,-1))} style={{ width: 66, height: 66, borderRadius: "50%", border: "1px solid #fee2e2", background: "#fee2e2", color: "#dc2626", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>⌫</button>
            <button onClick={() => { if (pin.length < 4) setPin(p => p + "0"); }} style={{ width: 66, height: 66, borderRadius: "50%", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#1e3a5f", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>0</button>
            <button onClick={submit} style={{ width: 66, height: 66, borderRadius: "50%", border: "none", background: "#1e3a5f", color: "#fff", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>✓</button>
          </div>
          <button onClick={() => { setRole(null); setPin(""); setErr(""); }} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>← Back</button>
        </div>
      )}
    </div>
  );
}

// ── InvoiceView ───────────────────────────────────────────────────────────
function InvoiceView({ txn, settings, onClose }) {
  const [showBt, setShowBt] = useState(false);
  const f = n => fmt(n, settings.currency);
  const amtWords = numToWords(Math.round(txn.total || txn.net || 0)) + " Rupees Only";
  const creditAmt = txn.payments ? (txn.payments.find(p => p.mode === "Credit") || {}).amount || 0 : (txn.paymentMode === "Credit" ? (txn.total || txn.net || 0) : 0);
  const hasSplit = txn.payments && txn.payments.length > 1;
  const paymentLabel = hasSplit ? txn.payments.filter(p => p.amount > 0).map(p => p.mode + ": " + f(p.amount)).join(" | ") : (txn.payments?.[0]?.mode || txn.paymentMode || "Cash");
  const total = txn.total || txn.net || 0;
  const subtotal = txn.subtotal || txn.items?.reduce((s, i) => s + (parseFloat(i.price) || 0) * Math.abs(parseFloat(i.qty) || 0), 0) || 0;
  const gstRows = buildGstRows(txn.items || [], txn.taxable || 0, subtotal);

  const doPrint = () => {
    const el = document.getElementById("inv-print");
    const win = window.open("", "_blank");
    if (!win || !el) return;
    win.document.write(`<html><head><title>Invoice ${txn.invoiceNo}</title><style>body{font-family:monospace;margin:20px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;}</style></head><body>${el.innerHTML}<br/><button onclick="window.print();window.close();" style="padding:10px 24px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Print / Save PDF</button></body></html>`);
    win.document.close();
  };

  const doWhatsApp = () => {
    let msg = `🧵 *${settings.shopName}*\n_${settings.shopTagline || ""}_\n${settings.shopAddress}\nGSTIN: ${settings.gstin}\n─────────────────────\n`;
    if (txn.void || txn.cancelled) msg += "❌ *VOID / CANCELLED INVOICE*\n─────────────────────\n";
    msg += `🧾 *INVOICE: ${txn.invoiceNo}*\n📅 Date: ${fmtDate(txn.date)}\n👤 Buyer: *${txn.customer?.name || txn.customerName}*\n`;
    txn.items.forEach((item, i) => { msg += `${i+1}. ${item.name}\n   ${item.qty} x ${f(item.price)} = *${f(item.price * item.qty)}* (GST ${((item.gstRate||0)*100).toFixed(0)}%)\n`; });
    msg += `─────────────────────\nGross Total: ${f(subtotal)}\n`;
    if (txn.discount > 0) msg += `Discount: -${f(txn.discount)}\n`;
    msg += `Taxable Value: ${f(txn.taxable)}\n`;
    gstRows.forEach(r => { msg += `CGST @${r.half}%: ${f(r.cgst)}\nSGST @${r.half}%: ${f(r.sgst)}\n`; });
    msg += `─────────────────────\n💰 *Net Amount: ${f(total)}*\n💳 Payment: ${paymentLabel}\n`;
    if (creditAmt > 0) msg += `⚠️ *Amount Due (Credit): ${f(creditAmt)}*\n`;
    msg += `─────────────────────\n_${amtWords}_\n\n${settings.footerNote}\n*${settings.signoff}*`;
    const phone = txn.customer?.phone || txn.customerPhone || "";
    window.open((phone ? `https://wa.me/91${phone}` : "https://wa.me/") + "?text=" + encodeURIComponent(msg), "_blank");
  };

  const doThermal = () => {
    const W = 32, line = "-".repeat(W);
    const ctr = s => " ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
    const row = (l, r) => l + " ".repeat(Math.max(1, W - l.length - r.length)) + r;
    let t = ctr(settings.shopName) + "\n" + ctr(settings.shopAddress || "") + "\nGSTIN: " + settings.gstin + "\n" + line + "\n";
    if (txn.void || txn.cancelled) t += "*** VOID / CANCELLED ***\n" + line + "\n";
    t += `Invoice: ${txn.invoiceNo}\nDate: ${fmtDate(txn.date)}\nBuyer: ${txn.customer?.name || txn.customerName}\n` + line + "\n";
    txn.items.forEach(item => { t += row(item.name + " (" + item.qty + "x" + (item.price||0).toFixed(2) + ")", ((item.price||0)*(item.qty||0)).toFixed(2)) + "\n"; });
    t += line + "\n";
    if (txn.discount > 0) t += row("Discount", "-" + fmt(txn.discount, "")) + "\n";
    t += row("Taxable", fmt(txn.taxable, "")) + "\n";
    gstRows.forEach(r => { t += row("CGST " + r.half + "%", fmt(r.cgst, "")) + "\n" + row("SGST " + r.half + "%", fmt(r.sgst, "")) + "\n"; });
    t += line + "\n" + row("NET", fmt(total, "")) + "\n" + line + "\nPayment: " + paymentLabel + "\n";
    if (creditAmt > 0) t += "AMOUNT DUE: " + fmt(creditAmt, "") + "\n";
    t += "\nAmt: " + amtWords + "\n" + line + "\n" + ctr(settings.footerNote || "") + "\n" + ctr(settings.signoff || "") + "\n\n\n";
    return t;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", overflowY: "auto" }}>
        {(txn.void || txn.cancelled) && <div style={{ background: "#fee2e2", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontWeight: 800, color: "#dc2626", fontSize: 15, textAlign: "center" }}>❌ VOID / CANCELLED INVOICE</div>}
        <div id="inv-print" style={{ border: "2px solid #000", padding: 10, fontFamily: "monospace", fontSize: 11, opacity: (txn.void || txn.cancelled) ? 0.55 : 1 }}>
          <div style={{ textAlign: "center", borderBottom: BDR, paddingBottom: 6, marginBottom: 6 }}>
            {(txn.void || txn.cancelled) && <div style={{ fontWeight: 900, fontSize: 14, color: "#dc2626", marginBottom: 4 }}>*** VOID / CANCELLED ***</div>}
            <div style={{ position: "relative", fontSize: 10, marginBottom: 4, minHeight: 16 }}>
              <span style={{ position: "absolute", left: 0 }}>STATE CODE : {settings.stateCode || "20"}</span>
              <span style={{ fontWeight: 700 }}>TAX INVOICE</span>
            </div>
            <div style={{ fontWeight: 900, fontSize: 28, letterSpacing: 8, fontFamily: "Georgia,serif" }}>{settings.shopName}</div>
            {settings.shopTagline && <div style={{ fontSize: 10, fontStyle: "italic", fontWeight: 700 }}>{settings.shopTagline}</div>}
            <div style={{ fontSize: 10, fontWeight: 700 }}>{settings.shopAddress}</div>
            {settings.shopPhone && <div style={{ fontSize: 10 }}>Ph: {settings.shopPhone}</div>}
            {settings.gstin && <div style={{ fontSize: 10, fontWeight: 700 }}>GSTIN : {settings.gstin}</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span><b>Invoice No:</b> {txn.invoiceNo}</span>
            <span><b>Date:</b> {fmtDate(txn.date)}</span>
          </div>
          <div style={{ marginBottom: 4 }}><b>Buyer:</b> {txn.customer?.name || txn.customerName}</div>
          {(txn.customer?.phone || txn.customerPhone) && <div style={{ marginBottom: 2 }}><b>Ph:</b> {txn.customer?.phone || txn.customerPhone}</div>}
          <div style={{ marginBottom: 6 }}><b>Address:</b> ............................................</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f3f4f6" }}>
              {["Sl.","Particulars","HSN","Qty","Rate","Amount"].map((h, i) => (
                <th key={h} style={tds({ textAlign: i >= 3 ? "right" : i === 0 ? "center" : "left", fontWeight: 700 })}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(txn.items || []).map((item, idx) => (
                <tr key={item.uid || idx} style={{ background: item.qty < 0 ? "#fff1f2" : "transparent" }}>
                  <td style={tds({ textAlign: "center" })}>{idx + 1}</td>
                  <td style={tds({})}>{item.name}{item.qty < 0 ? " (Return)" : ""}</td>
                  <td style={tds({ textAlign: "center" })}>—</td>
                  <td style={tds({ textAlign: "right", color: item.qty < 0 ? "#dc2626" : "inherit" })}>{item.qty}</td>
                  <td style={tds({ textAlign: "right" })}>{(item.price || 0).toFixed(2)}</td>
                  <td style={tds({ textAlign: "right", fontWeight: 600, color: item.qty < 0 ? "#dc2626" : "inherit" })}>{((item.price || 0) * (item.qty || 0)).toFixed(2)}</td>
                </tr>
              ))}
              {Array(Math.max(0, 4 - (txn.items || []).length)).fill(0).map((_, i) => (
                <tr key={"e" + i}>{[0,1,2,3,4,5].map(c => <td key={c} style={tds({ height: 20 })}>&nbsp;</td>)}</tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderLeft: BDR, borderRight: BDR, borderBottom: BDR }}>
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1, padding: "6px 8px", borderRight: BDR, fontSize: 10 }}>
                <b>Amount in Words:</b><br />{amtWords}
                <div style={{ marginTop: 6, paddingTop: 4, borderTop: "1px dashed #999" }}>
                  <b>Payment:</b> {paymentLabel}
                  {creditAmt > 0 && <div style={{ fontWeight: 700, color: "#dc2626", marginTop: 2 }}>⚠ Due: {f(creditAmt)}</div>}
                </div>
              </div>
              <div style={{ width: 210 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>Gross Total</span><span style={{ fontWeight: 600 }}>{f(subtotal)}</span></div>
                {txn.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>Less Discount</span><span style={{ fontWeight: 600 }}>{f(txn.discount)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>Taxable Value</span><span style={{ fontWeight: 600 }}>{f(txn.taxable)}</span></div>
                {gstRows.map(r => (
                  <Fragment key={r.rate}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>CGST @ {r.half}%</span><span style={{ fontWeight: 600 }}>{f(r.cgst)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>SGST @ {r.half}%</span><span style={{ fontWeight: 600 }}>{f(r.sgst)}</span></div>
                  </Fragment>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>IGST @</span><span style={{ fontWeight: 600 }}>—</span></div>
                {!!(txn.roundOff && txn.roundOff !== 0) && <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>Round Off</span><span>{(txn.roundOff > 0 ? "+" : "") + f(txn.roundOff)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", fontWeight: 900, fontSize: 12 }}><span>Net Value</span><span>{f(Math.round(total))}</span></div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, paddingTop: 6, fontSize: 9 }}>
            <span>{settings.footerNote}</span>
            <span style={{ textAlign: "right" }}><div style={{ marginBottom: 28 }}><b>{settings.signoff}</b></div><div>Authorised Signatory</div></span>
          </div>
          <div style={{ borderTop: BDR, marginTop: 4, paddingTop: 4, fontSize: 9, textAlign: "center" }}>Certified that details given above are true and correct.</div>
        </div>
        {creditAmt > 0 && !(txn.void || txn.cancelled) && (
          <div style={{ background: "#fee2e2", border: "2px solid #dc2626", borderRadius: 10, padding: "12px 14px", marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontWeight: 800, fontSize: 14, color: "#dc2626" }}>⚠ Amount Due (Credit)</div><div style={{ fontSize: 12, color: "#6b7280" }}>{txn.customer?.name || txn.customerName}</div></div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#dc2626" }}>{f(creditAmt)}</div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 14 }}>
          {[["🖨️","Print","#16a34a",doPrint],["💬","WA","#25d366",doWhatsApp],["🖨️","Thermal","#2563eb",() => setShowBt(true)],["✖","Close","#1e3a5f",onClose]].map(([icon,label,bg,fn]) => (
            <button key={label} onClick={fn} style={{ padding: "11px 0", background: bg, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 16 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
        {showBt && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) setShowBt(false); }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 8 }}>📲 Thermal Print</div>
              <pre style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 11, overflowX: "auto", marginBottom: 12, maxHeight: 280, overflowY: "auto", whiteSpace: "pre-wrap" }}>{doThermal()}</pre>
              <button onClick={() => navigator.clipboard.writeText(doThermal()).then(() => alert("Copied!"))}
                style={{ width: "100%", padding: "12px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>📋 Copy to Clipboard</button>
              <button onClick={() => setShowBt(false)} style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReceiptVoucher ────────────────────────────────────────────────────────
function ReceiptVoucher({ voucher, settings, onClose }) {
  const f = n => fmt(n, settings.currency);
  const doWhatsApp = () => {
    const msg = `🧵 *${settings.shopName}*\n─────────────────────\n📄 *RECEIPT VOUCHER: ${voucher.voucherNo}*\n📅 Date: ${fmtDate(voucher.date)}\n👤 Customer: *${voucher.customerName}*\n─────────────────────\n💰 Amount Received: *${f(voucher.amount)}*\n💳 Mode: ${voucher.paymentMode}\n📋 Previous Outstanding: ${f(voucher.prevOutstanding)}\n✅ Remaining Outstanding: ${f(voucher.remainingOutstanding)}\n─────────────────────\n*${settings.signoff}*`;
    const phone = voucher.customerPhone || "";
    window.open((phone ? `https://wa.me/91${phone}` : "https://wa.me/") + "?text=" + encodeURIComponent(msg), "_blank");
  };
  const doPrint = () => {
    const el = document.getElementById("rv-print");
    const win = window.open("", "_blank");
    if (!win || !el) return;
    win.document.write(`<html><head><title>Receipt ${voucher.voucherNo}</title><style>body{font-family:monospace;margin:20px;}</style></head><body>${el.innerHTML}<br/><button onclick="window.print();window.close();">Print</button></body></html>`);
    win.document.close();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
        <div id="rv-print" style={{ border: "2px solid #000", padding: 12, fontFamily: "monospace", fontSize: 11 }}>
          <div style={{ textAlign: "center", borderBottom: BDR, paddingBottom: 6, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 6 }}>{settings.shopName}</div>
            {settings.shopAddress && <div style={{ fontSize: 10 }}>{settings.shopAddress}</div>}
            {settings.gstin && <div style={{ fontSize: 10 }}>GSTIN: {settings.gstin}</div>}
            <div style={{ fontWeight: 800, fontSize: 13, marginTop: 4 }}>RECEIPT VOUCHER</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span><b>Voucher No:</b> {voucher.voucherNo}</span>
            <span><b>Date:</b> {fmtDate(voucher.date)}</span>
          </div>
          <div style={{ marginBottom: 8 }}><b>Received From:</b> {voucher.customerName}</div>
          <div style={{ borderTop: BDR, borderBottom: BDR, padding: "8px 0", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>Amount Received</span><span style={{ fontWeight: 800 }}>{f(voucher.amount)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>Payment Mode</span><span>{voucher.paymentMode}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>Previous Outstanding</span><span>{f(voucher.prevOutstanding)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}><span>Remaining Outstanding</span><span style={{ color: voucher.remainingOutstanding > 0 ? "#dc2626" : "#16a34a" }}>{f(voucher.remainingOutstanding)}</span></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 8 }}>
            <span>{settings.footerNote}</span>
            <span style={{ textAlign: "right" }}><div style={{ marginBottom: 20 }}><b>{settings.signoff}</b></div><div>Authorised Signatory</div></span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 14 }}>
          {[["🖨️","Print","#16a34a",doPrint],["💬","WA","#25d366",doWhatsApp],["✖","Close","#1e3a5f",onClose]].map(([icon,label,bg,fn]) => (
            <button key={label} onClick={fn} style={{ padding: "11px 0", background: bg, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 16 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CreditSettleModal ─────────────────────────────────────────────────────
function CreditSettleModal({ customer, outstanding, settings, onConfirm, onCancel }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const f = n => fmt(n, settings.currency);
  const handleConfirm = () => {
    const amt = parseFloat(String(amount).trim());
    if (isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
    if (amt > outstanding + 0.01) return alert("Amount cannot exceed outstanding " + f(outstanding));
    onConfirm(amt, mode);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 4 }}>💳 Settle Credit</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Customer: <b>{customer.name}</b></div>
        <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 700 }}>Outstanding</span>
          <span style={{ fontSize: 15, color: "#dc2626", fontWeight: 900 }}>{f(outstanding)}</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Amount Received (₹)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(outstanding)} style={inp} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Payment Mode</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["Cash","UPI","Card"].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", background: mode === m ? "#1e3a5f" : "#f3f4f6", color: mode === m ? "#fff" : "#374151" }}>{m}</button>
            ))}
          </div>
        </div>
        <button onClick={handleConfirm} style={{ width: "100%", padding: "13px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>✅ Confirm Settlement</button>
        <button onClick={onCancel} style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

// ── EditInvoiceModal ──────────────────────────────────────────────────────
function EditInvoiceModal({ txn, products, settings, onSave, onCancel, onVoidInvoice }) {
  const [items, setItems] = useState(txn.items.map(i => ({ ...i })));
  const [payments, setPayments] = useState(txn.payments || [{ mode: txn.paymentMode || "Cash", amount: txn.total || txn.net || 0 }]);
  const [discount, setDiscount] = useState(txn.discount || 0);
  const usedModes = payments.map(p => p.mode);
  const availableModesFor = cur => PAYMENT_MODES.filter(m => m === cur || !usedModes.includes(m));
  const inclusiveThreshold = settings.gstThreshold * (1 + settings.gstLow / 100);
  const getGstRate = (name, grossTaxable) => {
    const prod = products.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (prod && prod.gstOverride !== null && prod.gstOverride !== undefined) return prod.gstOverride / 100;
    return grossTaxable >= inclusiveThreshold ? settings.gstHigh / 100 : settings.gstLow / 100;
  };
  const grandSubtotal = items.reduce((s, i) => (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0) + s, 0);
  const grossTaxable = Math.round(Math.max(0, grandSubtotal - discount) * 100) / 100;
  const blendedRate = grandSubtotal > 0 ? items.reduce((s, i) => {
    const p = parseFloat(i.price) || 0, q = parseFloat(i.qty) || 0, sub = p * q;
    const itemDisc = grandSubtotal > 0 ? (sub / grandSubtotal) * discount : 0;
    return s + (sub / grandSubtotal) * getGstRate(i.name, sub - itemDisc);
  }, 0) : 0;
  const taxable = Math.round(grossTaxable / (1 + blendedRate) * 100) / 100;
  const gst = Math.round(grossTaxable * blendedRate / (1 + blendedRate) * 100) / 100;
  const netAmount = Math.round(grossTaxable);
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const paymentMismatch = payments.length > 1 && Math.abs(totalPaid - netAmount) > 1 && totalPaid > 0;
  const updateItem = (uid, f, v) => setItems(p => p.map(i => i.uid === uid ? { ...i, [f]: v } : i));
  const removeItem = uid => setItems(p => p.filter(i => i.uid !== uid));
  const addItem = () => setItems(p => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);
  const updatePayment = (idx, field, v) => setPayments(p => p.map((pm, i) => i === idx ? { ...pm, [field]: v } : pm));
  const addPayment = () => { const remaining = PAYMENT_MODES.filter(m => !payments.map(p => p.mode).includes(m)); if (remaining.length === 0) return; setPayments(p => [...p, { mode: remaining[0], amount: 0 }]); };
  const removePayment = idx => setPayments(p => p.filter((_, i) => i !== idx));
  const handleSave = () => {
    const validItems = items.filter(i => i.name && parseFloat(i.price) !== 0 && parseFloat(i.qty) !== 0).map(i => {
      const p = parseFloat(i.price), q = parseFloat(i.qty), sub = p * q;
      const itemDisc = grandSubtotal > 0 ? (sub / grandSubtotal) * discount : 0;
      const rate = getGstRate(i.name, sub - itemDisc);
      return { ...i, price: p, qty: q, subtotal: sub, gstRate: rate, total: sub * (1 + rate) };
    });
    if (validItems.length === 0) { alert("Add at least one item."); return; }
    const finalPay = payments.map((p, i) => i === 0 && payments.length === 1 && !p.amount ? { ...p, amount: netAmount } : { ...p, amount: parseFloat(p.amount) || 0 });
    if (finalPay.length > 1 && Math.abs(finalPay.reduce((s, p) => s + p.amount, 0) - netAmount) > 1) { alert("Payment total doesn't match net amount."); return; }
    onSave({ ...txn, items: validItems, subtotal: grandSubtotal, discount: Math.min(discount, grandSubtotal), taxable, gst, roundOff: 0, total: netAmount, payments: finalPay, paymentMode: finalPay[0]?.mode || "Cash", editedAt: new Date().toISOString() });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 2 }}>✏️ Edit Invoice {txn.invoiceNo}</div>
        <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 14, fontWeight: 600 }}>⏰ Editable within 24 hours of creation</div>
        {items.map(item => (
          <div key={item.uid} style={{ background: "#f9fafb", borderRadius: 10, padding: 10, marginBottom: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input list="edit-prod-list" value={item.name} onChange={e => updateItem(item.uid, "name", e.target.value)} placeholder="Item name" style={{ ...inp, fontSize: 13 }} />
              <button onClick={() => removeItem(item.uid)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
              <datalist id="edit-prod-list">{products.map(pr => <option key={pr.id} value={pr.name} />)}</datalist>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><div style={{ ...lbl, fontSize: 10 }}>Price</div><input type="number" value={item.price} onChange={e => updateItem(item.uid, "price", e.target.value)} style={{ ...inp, padding: "8px 10px" }} /></div>
              <div style={{ flex: 1 }}><div style={{ ...lbl, fontSize: 10 }}>Qty (use negative for return)</div><input type="number" value={item.qty} onChange={e => updateItem(item.uid, "qty", e.target.value)} style={{ ...inp, padding: "8px 10px" }} /></div>
            </div>
          </div>
        ))}
        <button onClick={addItem} style={{ width: "100%", padding: "9px 0", background: "#eff6ff", color: "#1e3a5f", border: "2px dashed #93c5fd", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>+ Add Item</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>Discount (₹)</span>
          <input type="number" min={0} value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: 90, textAlign: "right", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 8px", fontSize: 14 }} />
        </div>
        <div style={{ background: "#eff6ff", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6b7280" }}>Taxable</span><span style={{ fontWeight: 700 }}>{fmt(taxable, settings.currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#6b7280" }}>GST</span><span style={{ fontWeight: 700 }}>{fmt(gst, settings.currency)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #bfdbfe", paddingTop: 8, marginTop: 4, fontWeight: 800, fontSize: 15 }}><span>Net</span><span>{fmt(netAmount, settings.currency)}</span></div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>💳 Payment</div>
        {payments.map((pm, idx) => (
          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <select value={pm.mode} onChange={e => updatePayment(idx, "mode", e.target.value)} style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
              {availableModesFor(pm.mode).map(m => <option key={m}>{m}</option>)}
            </select>
            <input type="number" value={pm.amount} onChange={e => updatePayment(idx, "amount", parseFloat(e.target.value) || 0)} placeholder={idx === 0 && payments.length === 1 ? String(netAmount) : "Amount"} style={{ width: 100, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
            {payments.length > 1 && <button onClick={() => removePayment(idx)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer" }}>✕</button>}
          </div>
        ))}
        {payments.length < PAYMENT_MODES.length && <button onClick={addPayment} style={{ width: "100%", padding: "8px 0", background: "#f3f4f6", color: "#374151", border: "1px dashed #d1d5db", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>+ Add Payment Mode</button>}
        {paymentMismatch && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ Paid {fmt(totalPaid, settings.currency)} ≠ Net {fmt(netAmount, settings.currency)}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={handleSave} style={{ flex: 2, padding: "13px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>💾 Save Changes</button>
          <button onClick={onCancel} style={{ flex: 1, padding: "13px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
        </div>
        <button onClick={() => { if (window.confirm("Mark as VOID? Invoice kept in records but amounts zeroed.")) onVoidInvoice(); }}
          style={{ width: "100%", marginTop: 8, padding: "11px 0", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>🚫 Void Invoice</button>
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
  const [draftSettings, setDraftSettings] = useState(defaultSettings);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [products, setProducts] = useState([]);
  const [syncStatus, setSyncStatus] = useState("idle");

  // Billing state
  const [selectedCustomer, setSelectedCustomer] = useState("c1");
  const [cart, setCart] = useState([]);
  const [payments, setPayments] = useState([{ mode: "Cash", amount: "" }]);
  const [discount, setDiscount] = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [showReceipt, setShowReceipt] = useState(null);
  const [editTxn, setEditTxn] = useState(null);
  const [saving, setSaving] = useState(false);

  // Customer state
  const [newName, setNewName] = useState(""); const [newPhone, setNewPhone] = useState("");
  const [custError, setCustError] = useState(""); const [custSuccess, setCustSuccess] = useState("");
  const [settleCustomer, setSettleCustomer] = useState(null);
  const [showVoucher, setShowVoucher] = useState(null);
  const [showLedger, setShowLedger] = useState(null);

  // Products state
  const [newProdName, setNewProdName] = useState(""); const [newProdGst, setNewProdGst] = useState("default");
  const [prodMsg, setProdMsg] = useState("");

  // History state
  const [histView, setHistView] = useState("bills");
  const [selectedDay, setSelectedDay] = useState(null);
  const [reportFrom, setReportFrom] = useState(""); const [reportTo, setReportTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [creditReportView, setCreditReportView] = useState(false);

  // Settings state
  const [newAdminPin, setNewAdminPin] = useState(""); const [newStaffPin, setNewStaffPin] = useState("");

  const isAdmin = role === "admin";
  const f = n => fmt(n, settings.currency);

  // ── Load data ─────────────────────────────────────────────
  useEffect(() => {
    if (!shopCode) return;
    setReady(false);
    (async () => {
      setSyncStatus("syncing");
      try {
        const s = await getSettings(shopCode);
        if (!s) { setIsNewShop(true); setReady(true); return; }
        const merged = { ...defaultSettings, ...s };
        setSettings(merged); setDraftSettings(merged);
        const [txns, custs, prods, setts] = await Promise.all([
          getTransactions(shopCode), getCustomers(shopCode),
          getProducts(shopCode), getSettlements(shopCode),
        ]);
        setTransactions(txns || []);
        setCustomers(custs?.length ? custs : [{ id: "c1", name: "Walk-in Customer", phone: "" }]);
        setProducts(prods || []);
        setSettlements(setts || []);
        setPayments([{ mode: merged.defaultPaymentMode, amount: "" }]);
        setIsNewShop(false); setSyncStatus("ok");
      } catch { setSyncStatus("error"); setIsNewShop(true); }
      setReady(true);
    })();
  }, [shopCode]);

  const handleChangeShop = () => {
    try { localStorage.removeItem("fabricbill_shopcode"); localStorage.removeItem("fabricbill_session"); } catch {}
    setShopCode(null); setRole(null); setReady(false);
    setTransactions([]); setCustomers([]); setProducts([]); setSettlements([]);
    setSettings(defaultSettings); setDraftSettings(defaultSettings);
  };

  // ── GST Calculations ──────────────────────────────────────
  const inclusiveThreshold = settings.gstThreshold * (1 + settings.gstLow / 100);

  const cartWithTax = cart.map(item => {
    const price = parseFloat(item.price) || 0, qty = parseFloat(item.qty) || 0, subtotal = price * qty;
    const grandSub = cart.reduce((s, i) => (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0) + s, 0);
    const manualDisc = Math.min(parseFloat(discount) || 0, grandSub);
    const collected = parseFloat(amountCollected) || 0;
    const effectiveDisc = collected > 0 ? Math.max(0, grandSub - collected) : manualDisc;
    const itemDiscShare = grandSub > 0 ? (subtotal / grandSub) * effectiveDisc : 0;
    const grossItemTaxable = subtotal - itemDiscShare;
    const prod = products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
    let rate;
    if (prod && prod.gstOverride !== null && prod.gstOverride !== undefined) rate = prod.gstOverride / 100;
    else rate = grossItemTaxable >= inclusiveThreshold ? settings.gstHigh / 100 : settings.gstLow / 100;
    return { ...item, price, qty, subtotal, gstRate: rate, total: subtotal * (1 + rate) };
  });

  const grandSubtotal = cartWithTax.reduce((s, i) => s + i.subtotal, 0);
  const manualDiscount = Math.min(parseFloat(discount) || 0, grandSubtotal);
  const collected = parseFloat(amountCollected) || 0;
  const useCollected = collected > 0 && grandSubtotal > 0;
  const effectiveDiscount = useCollected ? Math.max(0, grandSubtotal - collected) : manualDiscount;
  const blendedRate = grandSubtotal > 0 ? cartWithTax.reduce((s, i) => s + (i.subtotal / grandSubtotal) * i.gstRate, 0) : 0;
  const grossAfterDiscount = useCollected ? Math.max(0, collected) : grandSubtotal - manualDiscount;
  const collectedTaxable = Math.floor(grossAfterDiscount / (1 + blendedRate) * 100) / 100;
  const collectedGST = Math.round((grossAfterDiscount - collectedTaxable) * 100) / 100;
  const collectedDiscount = useCollected ? Math.round(Math.max(0, grandSubtotal - grossAfterDiscount) * 100) / 100 : manualDiscount;
  const netBeforeRound = useCollected ? collected : collectedTaxable + collectedGST;
  const netAmount = useCollected ? Math.round(collected) : Math.round(netBeforeRound);
  const roundOff = Math.round((netAmount - netBeforeRound) * 100) / 100;

  const validCart = cartWithTax.filter(i => i.name && i.price !== 0 && i.qty !== 0);
  const totalPayments = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const creditInPayments = payments.find(p => p.mode === "Credit");
  const creditAmount = parseFloat(creditInPayments?.amount) || 0;
  const hasCredit = creditAmount > 0;
  const usedPaymentModes = payments.map(p => p.mode);
  const availableModesFor = cur => PAYMENT_MODES.filter(m => m === cur || !usedPaymentModes.includes(m));
  const canAddPaymentRow = payments.length < PAYMENT_MODES.length;
  const paymentSplitMismatch = payments.length > 1 && totalPayments > 0 && Math.abs(totalPayments - netAmount) > 1;

  // Credit requires named customer
  const creditNeedsCustomer = hasCredit && selectedCustomer === "c1";

  const addLine = () => setCart(p => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);
  const updateLine = (uid, field, v) => setCart(p => p.map(i => i.uid === uid ? { ...i, [field]: v } : i));
  const removeLine = uid => setCart(p => p.filter(i => i.uid !== uid));
  const updatePaymentRow = (idx, field, v) => setPayments(p => p.map((pm, i) => i === idx ? { ...pm, [field]: v } : pm));
  const addPaymentRow = () => { const rem = PAYMENT_MODES.filter(m => !payments.map(p => p.mode).includes(m)); if (!rem.length) return; setPayments(p => [...p, { mode: rem[0], amount: "" }]); };
  const removePaymentRow = idx => setPayments(p => p.filter((_, i) => i !== idx));

  // ── Save bill ─────────────────────────────────────────────
  const handleConfirmPayment = async () => {
    if (validCart.length === 0) return;
    if (creditNeedsCustomer) return alert("Credit sales require a named customer. Please select or create a customer.");
    if (paymentSplitMismatch) return alert(`Payment total (${f(totalPayments)}) doesn't match net amount (${f(netAmount)}). Please fix.`);
    setSaving(true);
    try {
      const finalPayments = payments.map((p, i) => i === 0 && payments.length === 1 && !p.amount ? { ...p, amount: netAmount } : { ...p, amount: parseFloat(p.amount) || 0 });
      const cust = customers.find(c => c.id === selectedCustomer) || customers[0];
      const invoiceNo = await getNextInvoiceNo(shopCode);
      const txn = {
        id: genId(), invoiceNo, date: new Date().toISOString(),
        customer: cust, customerName: cust.name, customerPhone: cust.phone || "",
        items: validCart, subtotal: grandSubtotal, discount: collectedDiscount,
        taxable: collectedTaxable, gst: collectedGST, roundOff, total: netAmount,
        payments: finalPayments, paymentMode: finalPayments[0]?.mode || "Cash",
        createdBy: role,
      };
      setTransactions(p => [txn, ...p]);
      await insertTransaction(shopCode, txn);
      setSyncStatus("ok");
      setShowReceipt(txn);
      setCart([]); setDiscount(""); setAmountCollected(""); setPayments([{ mode: settings.defaultPaymentMode, amount: "" }]); setSelectedCustomer("c1");
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  // ── Edit / Void ───────────────────────────────────────────
  const handleEditSave = async txn => {
    await updateTransaction(shopCode, txn);
    setTransactions(p => p.map(t => t.id === txn.id ? txn : t));
    setEditTxn(null); setShowReceipt(txn);
  };
  const handleVoidInvoice = async txn => {
    const voided = { ...txn, void: true, voidedAt: new Date().toISOString(), total: 0, subtotal: 0, taxable: 0, gst: 0, discount: 0, payments: (txn.payments || []).map(p => ({ ...p, amount: 0 })) };
    await updateTransaction(shopCode, voided);
    setTransactions(p => p.map(t => t.id === voided.id ? voided : t));
    setEditTxn(null); setShowReceipt(voided);
  };

  // ── Credit Settlement ─────────────────────────────────────
  const getCustomerOutstanding = useCallback((custId) => {
    const txnCredit = transactions.filter(t => !t.void && !t.cancelled && (t.customer?.id === custId || t.customerId === custId))
      .reduce((s, t) => s + (t.payments ? (t.payments.find(p => p.mode === "Credit")?.amount || 0) : (t.paymentMode === "Credit" ? t.total : 0)), 0);
    const settled = settlements.filter(s => s.customerId === custId).reduce((s, v) => s + v.amount, 0);
    return Math.max(0, txnCredit - settled);
  }, [transactions, settlements]);

  const handleSettle = async (amount, mode) => {
    const cust = settleCustomer;
    const outstanding = getCustomerOutstanding(cust.id);
    const voucherNo = await getNextVoucherNo(shopCode);
    const voucher = {
      id: genId(), voucherNo, date: new Date().toISOString(),
      customerId: cust.id, customerName: cust.name, customerPhone: cust.phone || "",
      amount, paymentMode: mode,
      prevOutstanding: outstanding,
      remainingOutstanding: Math.max(0, outstanding - amount),
      settledBy: role,
    };
    await insertSettlement(shopCode, voucher);
    setSettlements(p => [voucher, ...p]);
    setSettleCustomer(null);
    setShowVoucher(voucher);
  };

  // ── Helpers for reports ───────────────────────────────────
  const payAmt = (t, mode) => t.void || t.cancelled ? 0 : Number(t.payments ? t.payments.find(p => p.mode === mode)?.amount || 0 : (t.paymentMode === mode ? t.total : 0)) || 0;

  const dayTotals = txns => ({
    gross: txns.filter(t => !t.void && !t.cancelled).reduce((s, t) => s + (t.subtotal || 0), 0),
    discount: txns.filter(t => !t.void && !t.cancelled).reduce((s, t) => s + (t.discount || 0), 0),
    taxable: txns.filter(t => !t.void && !t.cancelled).reduce((s, t) => s + (t.taxable || 0), 0),
    gst: txns.filter(t => !t.void && !t.cancelled).reduce((s, t) => s + (t.gst || 0), 0),
    net: txns.filter(t => !t.void && !t.cancelled).reduce((s, t) => s + (t.total || 0), 0),
    count: txns.filter(t => !t.void && !t.cancelled).length,
    voidCount: txns.filter(t => t.void || t.cancelled).length,
    cash: txns.reduce((s, t) => s + payAmt(t, "Cash"), 0),
    upi: txns.reduce((s, t) => s + payAmt(t, "UPI"), 0),
    card: txns.reduce((s, t) => s + payAmt(t, "Card"), 0),
    credit: txns.reduce((s, t) => s + payAmt(t, "Credit"), 0),
  });

  const grouped = {};
  transactions.forEach(txn => {
    const day = new Date(txn.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(txn);
  });
  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  const getFilteredDays = () => days.filter(day => {
    const d = new Date(day);
    if (reportFrom) { const [fy, fm, fd] = reportFrom.split("-").map(Number); if (d < new Date(fy, fm-1, fd)) return false; }
    if (reportTo) { const [ty, tm, td] = reportTo.split("-").map(Number); if (d > new Date(ty, tm-1, td, 23, 59, 59)) return false; }
    return true;
  });

  const filteredTxns = getFilteredDays().flatMap(d => grouped[d] || []);
  const rangeTotals = dayTotals(filteredTxns);

  const filteredBills = transactions.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return t.customer?.name?.toLowerCase().includes(q) || t.customerName?.toLowerCase().includes(q) || t.invoiceNo?.toLowerCase().includes(q) || (t.customer?.phone || t.customerPhone || "").includes(q);
  });

  // ── Export CSV ────────────────────────────────────────────
  const exportReportExcel = (txns, label) => {
    const gstRowsForTxn = (t) => {
      const rows = buildGstRows(t.items || [], t.taxable || 0, t.subtotal || 0);
      const cgst = rows.reduce((s, r) => s + r.cgst, 0);
      const sgst = rows.reduce((s, r) => s + r.sgst, 0);
      return { cgst, sgst, igst: 0 };
    };
    const cols = [
      { key: "invoiceNo", label: "Invoice No" }, { key: "date", label: "Date" },
      { key: "customer", label: "Customer" }, { key: "phone", label: "Phone" },
      { key: "items", label: "Items" }, { key: "gross", label: "Gross" },
      { key: "discount", label: "Discount" }, { key: "taxable", label: "Taxable" },
      { key: "cgst", label: "CGST" }, { key: "sgst", label: "SGST" },
      { key: "igst", label: "IGST" }, { key: "totalGst", label: "Total GST" },
      { key: "net", label: "Net Amount" }, { key: "cash", label: "Cash" },
      { key: "upi", label: "UPI" }, { key: "card", label: "Card" },
      { key: "credit", label: "Credit Due" }, { key: "status", label: "Status" },
    ];
    const rows = txns.map(t => {
      const { cgst, sgst, igst } = gstRowsForTxn(t);
      return {
        invoiceNo: t.invoiceNo || "", date: fmtDate(t.date),
        customer: t.customer?.name || t.customerName || "",
        phone: t.customer?.phone || t.customerPhone || "",
        items: (t.items || []).map(i => i.name + "×" + i.qty + "@" + i.price).join("; "),
        gross: Number(t.subtotal || 0).toFixed(2), discount: Number(t.discount || 0).toFixed(2),
        taxable: Number(t.taxable || 0).toFixed(2),
        cgst: Number(t.void || t.cancelled ? 0 : cgst).toFixed(2),
        sgst: Number(t.void || t.cancelled ? 0 : sgst).toFixed(2),
        igst: Number(igst).toFixed(2),
        totalGst: Number(t.void || t.cancelled ? 0 : t.gst || 0).toFixed(2),
        net: Number(t.void || t.cancelled ? 0 : t.total || 0).toFixed(2),
        cash: Number(t.void || t.cancelled ? 0 : payAmt(t, "Cash")).toFixed(2),
        upi: Number(t.void || t.cancelled ? 0 : payAmt(t, "UPI")).toFixed(2),
        card: Number(t.void || t.cancelled ? 0 : payAmt(t, "Card")).toFixed(2),
        credit: Number(t.void || t.cancelled ? 0 : payAmt(t, "Credit")).toFixed(2),
        status: t.void ? "VOID" : t.cancelled ? "CANCELLED" : "Active",
      };
    });
    downloadCSV(toCSV(rows, cols), "FabricBill-Report-" + label + ".csv");
  };

  const exportSettlementsCSV = () => {
    const cols = [{ key: "voucherNo", label: "Voucher No" }, { key: "date", label: "Date" }, { key: "customer", label: "Customer" }, { key: "amount", label: "Amount" }, { key: "mode", label: "Payment Mode" }, { key: "prev", label: "Prev Outstanding" }, { key: "remaining", label: "Remaining" }];
    const rows = settlements.map(s => ({ voucherNo: s.voucherNo, date: fmtDate(s.date), customer: s.customerName, amount: Number(s.amount).toFixed(2), mode: s.paymentMode, prev: Number(s.prevOutstanding).toFixed(2), remaining: Number(s.remainingOutstanding).toFixed(2) }));
    downloadCSV(toCSV(rows, cols), "FabricBill-Settlements.csv");
  };

  // ── Save settings ─────────────────────────────────────────
  const handleSaveSettings = async () => {
    try {
      const updated = { ...draftSettings };
      if (newAdminPin.length === 4) updated.adminPinHash = await hashPin(newAdminPin);
      if (newStaffPin.length === 4) updated.staffPinHash = await hashPin(newStaffPin);
      await saveSettings(shopCode, updated);
      setSettings(updated); setNewAdminPin(""); setNewStaffPin("");
      setPayments([{ mode: updated.defaultPaymentMode, amount: "" }]);
      alert("Settings saved ✅");
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const syncBadge = { idle: null, syncing: ["🔄", "#f59e0b"], ok: ["☁️", "#16a34a"], error: ["⚠️", "#dc2626"] };

  const navTabs = isAdmin
    ? [["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"],["products","📦","Products"],["settings","⚙️","Settings"]]
    : [["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"]];

  // ── Screens ───────────────────────────────────────────────
  if (!shopCode) return <ShopCodeScreen onEnter={code => { setShopCode(code); try { localStorage.setItem("fabricbill_shopcode", code); } catch {} }} />;
  if (!ready) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12, background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)" }}>
      <div style={{ fontSize: 40 }}>🧵</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>FabricBill</div>
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Loading {shopCode}…</div>
    </div>
  );
  if (isNewShop) return <RegisterScreen shopCode={shopCode} onRegistered={() => { setIsNewShop(false); setReady(false); }} />;
  if (!role) return <LoginScreen onLogin={r => { setRole(r); setTab("billing"); try { localStorage.setItem("fabricbill_session", JSON.stringify({ role: r, expiry: Date.now() + 24 * 3600000 })); } catch {} }} settings={settings} shopCode={shopCode} onChangeShop={handleChangeShop} />;

  return (
    <div style={{ fontFamily: "'DM Sans',-apple-system,sans-serif", background: "#f0f2f5", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "#1e3a5f", color: "#fff", padding: "12px 16px", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{settings.shopName}</div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 1 }}>🏪 {shopCode} · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {syncBadge[syncStatus] && <span style={{ background: syncBadge[syncStatus][1], color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{syncBadge[syncStatus][0]}</span>}
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
              <div style={{ ...lbl, marginBottom: 6 }}>Customer</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}
                  style={{ ...inp, flex: 1, margin: 0, borderColor: creditNeedsCustomer ? "#dc2626" : "#d1d5db" }}>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>)}
                </select>
                <button onClick={() => setTab("customers")} style={{ padding: "10px 14px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>+ New</button>
              </div>
              {creditNeedsCustomer && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 6, fontWeight: 600 }}>⚠ Credit sales require a named customer.</div>}
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🧾 Items</div>
              {cart.map(item => {
                const p = parseFloat(item.price) || 0, q = parseFloat(item.qty) || 0;
                const cartItem = cartWithTax.find(i => i.uid === item.uid);
                const rate = cartItem ? cartItem.gstRate : 0;
                const lineTotal = p * q;
                const prod = products.find(pr => pr.name.toLowerCase() === item.name.toLowerCase());
                const hasOverride = prod && prod.gstOverride !== null && prod.gstOverride !== undefined;
                const isReturn = q < 0;
                return (
                  <div key={item.uid} style={{ background: isReturn ? "#fff1f2" : "#f9fafb", borderRadius: 10, padding: 12, marginBottom: 10, border: isReturn ? "1px solid #fca5a5" : "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 6 }}>
                      <input list="prod-list" value={item.name} onChange={e => updateLine(item.uid, "name", e.target.value)} placeholder="Item name" style={{ ...inp, flex: 1, padding: "8px 10px", fontSize: 13 }} />
                      <button onClick={() => removeLine(item.uid)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
                      <datalist id="prod-list">{products.map(pr => <option key={pr.id || pr.name} value={pr.name} />)}</datalist>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}><div style={{ ...lbl, fontSize: 10 }}>Price (₹)</div><input type="number" value={item.price} onChange={e => updateLine(item.uid, "price", e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} /></div>
                      <div style={{ width: 120 }}>
                        <div style={{ ...lbl, fontSize: 10 }}>Qty {isReturn ? "(Return)" : ""}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <button onClick={() => updateLine(item.uid, "qty", parseFloat((q - 1).toFixed(2)))} style={{ width: 32, height: 38, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#1e3a5f" }}>−</button>
                          <input type="number" value={item.qty} onChange={e => updateLine(item.uid, "qty", e.target.value)} style={{ width: 46, textAlign: "center", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 4px", fontSize: 13 }} />
                          <button onClick={() => updateLine(item.uid, "qty", parseFloat((q + 1).toFixed(2)))} style={{ width: 32, height: 38, border: "1px solid #d1d5db", background: "#fff", borderRadius: 6, fontSize: 18, cursor: "pointer", fontWeight: 700, color: "#1e3a5f" }}>+</button>
                        </div>
                      </div>
                    </div>
                    {p !== 0 && q !== 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, background: "#fff", borderRadius: 6, padding: "5px 8px", border: "1px solid #e5e7eb" }}>
                        <span style={{ color: isReturn ? "#dc2626" : hasOverride ? "#7c3aed" : rate * 100 >= settings.gstHigh ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                          {isReturn ? "↩ Return" : `GST ${(rate * 100).toFixed(0)}%${hasOverride ? " ★" : ""}`}
                        </span>
                        <span style={{ fontWeight: 800, color: isReturn ? "#dc2626" : "#1e3a5f" }}>{f(lineTotal)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {cart.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0", background: "#f9fafb", borderRadius: 8, border: "1px dashed #e5e7eb" }}>Tap "+ Add Item" to start billing</div>}
              <button onClick={addLine} style={{ width: "100%", padding: "12px 0", background: "#eff6ff", color: "#1e3a5f", border: "2px dashed #93c5fd", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>+ Add Item</button>
            </div>

            {cart.length > 0 && (
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#1e3a5f" }}>💰 Summary</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10, paddingBottom: 10, borderBottom: "1px dashed #e5e7eb" }}>
                  <span style={{ color: "#6b7280" }}>Subtotal ({cart.length} item{cart.length > 1 ? "s" : ""})</span>
                  <span style={{ fontWeight: 700 }}>{f(grandSubtotal)}</span>
                </div>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ ...lbl, color: "#92400e", marginBottom: 6 }}>💵 Amount Collected</div>
                  <input type="number" min={0} value={amountCollected} onChange={e => { setAmountCollected(e.target.value); setDiscount(""); }} placeholder={"Full price: " + f(grandSubtotal)} style={{ ...inp, border: "1px solid #fcd34d", fontWeight: 700, fontSize: 15, background: "#fffde7" }} />
                  <div style={{ fontSize: 10, color: "#92400e", marginTop: 5 }}>Leave blank to use full price or manual discount</div>
                </div>
                {settings.enableDiscount && !amountCollected && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, background: "#f9fafb", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>Discount (₹)</span>
                    <input type="number" min={0} value={discount} onChange={e => setDiscount(e.target.value)} style={{ width: 90, textAlign: "right", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 8px", fontSize: 14, background: "#fff" }} />
                  </div>
                )}
                <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  {collectedDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#dc2626" }}><span>Discount</span><span style={{ fontWeight: 700 }}>− {f(collectedDiscount)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#6b7280" }}><span>Taxable Value</span><span style={{ fontWeight: 600 }}>{f(collectedTaxable)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#6b7280" }}><span>GST ({(blendedRate * 100).toFixed(0)}%)</span><span style={{ fontWeight: 600 }}>{f(collectedGST)}</span></div>
                  {roundOff !== 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, color: "#9ca3af" }}><span>Round Off</span><span>{(roundOff > 0 ? "+" : "") + f(roundOff)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, fontWeight: 900, color: "#1e3a5f", borderTop: "2px solid #16a34a", paddingTop: 10, marginTop: 4 }}><span>Net Amount</span><span style={{ color: "#16a34a" }}>{f(netAmount)}</span></div>
                </div>
                <div style={{ marginTop: 4 }}>
                  <div style={{ ...lbl, marginBottom: 8 }}>💳 Payment Mode(s)</div>
                  {payments.map((pm, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                      <select value={pm.mode} onChange={e => updatePaymentRow(idx, "mode", e.target.value)} style={{ flex: 1, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
                        {availableModesFor(pm.mode).map(m => <option key={m}>{m}</option>)}
                      </select>
                      <input type="number" value={pm.amount} onChange={e => updatePaymentRow(idx, "amount", e.target.value)} placeholder={idx === 0 && payments.length === 1 ? String(netAmount) : "Amount"} style={{ width: 100, padding: "9px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
                      {payments.length > 1 && <button onClick={() => removePaymentRow(idx)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>}
                    </div>
                  ))}
                  {canAddPaymentRow && <button onClick={addPaymentRow} style={{ width: "100%", padding: "8px 0", background: "#f3f4f6", color: "#374151", border: "1px dashed #d1d5db", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 4 }}>+ Split Payment</button>}
                  {paymentSplitMismatch && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ Total paid {f(totalPayments)} ≠ Net {f(netAmount)}</div>}
                  {creditAmount > 0 && <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginTop: 8, fontWeight: 700, color: "#dc2626", fontSize: 13 }}>⚠ Credit: {f(creditAmount)}{creditNeedsCustomer ? " — Select a named customer first" : ""}</div>}
                </div>
                <button onClick={handleConfirmPayment} disabled={validCart.length === 0 || saving || creditNeedsCustomer || paymentSplitMismatch}
                  style={{ marginTop: 14, width: "100%", padding: "15px 0", background: (validCart.length === 0 || saving || creditNeedsCustomer || paymentSplitMismatch) ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: "pointer", letterSpacing: 0.5 }}>
                  {saving ? "Saving…" : "✅ Confirm Payment"}
                </button>
              </div>
            )}
          </>
        )}

        {/* ── CUSTOMERS TAB ── */}
        {tab === "customers" && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>➕ New Customer</div>
              <div style={{ marginBottom: 10 }}><label style={lbl}>Full Name</label><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Rajesh Kumar" style={inp} /></div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Phone Number</label><input value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" inputMode="numeric" style={inp} /></div>
              {custError && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ {custError}</div>}
              {custSuccess && <div style={{ color: "#16a34a", fontSize: 13, marginBottom: 8, background: "#f0fdf4", padding: "6px 10px", borderRadius: 6 }}>✅ {custSuccess}</div>}
              <button onClick={async () => {
                setCustError(""); setCustSuccess("");
                if (!newName.trim()) return setCustError("Name required.");
                if (!newPhone.match(/^\d{10}$/)) return setCustError("Enter valid 10-digit number.");
                if (customers.find(c => c.phone === newPhone)) return setCustError("Phone already registered.");
                const nc = { id: genId(), name: newName.trim(), phone: newPhone };
                await upsertCustomer(shopCode, nc);
                setCustomers(p => [...p, nc]); setCustSuccess(`"${nc.name}" added!`); setNewName(""); setNewPhone("");
              }} style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Create Customer</button>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>👥 All Customers ({customers.length})</div>
              {customers.map((c, i) => {
                const txns = transactions.filter(t => t.customer?.id === c.id || t.customerId === c.id);
                const spent = txns.filter(t => !t.void && !t.cancelled).reduce((s, t) => s + (t.total || 0), 0);
                const outstanding = getCustomerOutstanding(c.id);
                return (
                  <div key={c.id} style={{ padding: "12px 0", borderBottom: i < customers.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{c.phone || "No phone"} · {txns.length} bill{txns.length !== 1 ? "s" : ""}</div>
                        {outstanding > 0 && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginTop: 2 }}>⚠ Outstanding: {f(outstanding)}</div>}
                      </div>
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <div style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 14 }}>{f(spent)}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>total billed</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {outstanding > 0 && (
                            <button onClick={() => setSettleCustomer(c)}
                              style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>💳 Settle</button>
                          )}
                          <button onClick={() => setShowLedger(c)}
                            style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📒 Ledger</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <>
            {isAdmin && (
              <div style={{ display: "flex", background: "#fff", borderRadius: 10, padding: 4, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                {[["bills","📋 Bills"],["report","📊 Report"]].map(([k, l]) => (
                  <button key={k} onClick={() => { setHistView(k); setSelectedDay(null); setCreditReportView(false); }}
                    style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", background: histView === k ? "#1e3a5f" : "transparent", color: histView === k ? "#fff" : "#9ca3af" }}>{l}</button>
                ))}
              </div>
            )}

            {(histView === "bills" || !isAdmin) && (
              <div style={card}>
                <div style={{ marginBottom: 12 }}><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Search by name, invoice, phone..." style={{ ...inp, fontSize: 13 }} /></div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>📋 Bills ({filteredBills.length})</div>
                {filteredBills.length === 0
                  ? <div style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>No bills found</div>
                  : filteredBills.map(txn => {
                    const canEdit = isAdmin && !(txn.void || txn.cancelled) && isWithin24Hours(txn.date);
                    const pmtLabel = txn.payments && txn.payments.length > 1 ? txn.payments.filter(p => p.amount > 0).map(p => p.mode).join("+") : (txn.payments?.[0]?.mode || txn.paymentMode);
                    const txnCredit = payAmt(txn, "Credit");
                    const isVoid = txn.void || txn.cancelled;
                    return (
                      <div key={txn.id} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12, marginBottom: 12, opacity: isVoid ? 0.5 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{txn.customer?.name || txn.customerName} {isVoid && <span style={{ color: "#dc2626", fontSize: 11, fontWeight: 800, background: "#fee2e2", padding: "1px 6px", borderRadius: 4 }}>VOID</span>}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{txn.invoiceNo} · {fmtDateTime(txn.date)}</div>
                            {txn.editedAt && <div style={{ fontSize: 10, color: "#f59e0b" }}>✏️ Edited: {fmtDateTime(txn.editedAt)}</div>}
                          </div>
                          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, color: isVoid ? "#9ca3af" : "#16a34a" }}>{isVoid ? "VOID" : f(txn.total || txn.net || 0)}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{pmtLabel}</div>
                            {txnCredit > 0 && !isVoid && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>Due: {f(txnCredit)}</div>}
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => setShowReceipt(txn)} style={{ background: "#eff6ff", border: "none", borderRadius: 6, color: "#2563eb", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>👁 View</button>
                              {canEdit && <button onClick={() => setEditTxn(txn)} style={{ background: "#fef3c7", border: "none", borderRadius: 6, color: "#92400e", padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✏️ Edit</button>}
                            </div>
                          </div>
                        </div>
                        {(txn.items || []).map((item, ii) => (
                          <div key={item.uid || ii} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                            <span style={{ color: item.qty < 0 ? "#dc2626" : "inherit" }}>{item.name} × {item.qty} @ {f(item.price)}{item.qty < 0 ? " ↩" : ""}</span>
                            <span style={{ color: (item.gstRate || 0) * 100 >= settings.gstHigh ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{((item.gstRate || 0) * 100).toFixed(0)}% GST</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
              </div>
            )}

            {isAdmin && histView === "report" && !creditReportView && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>📊 Sales Report</div>
                  <button onClick={() => setCreditReportView(true)} style={{ padding: "6px 12px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📒 Credit Report</button>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}><div style={{ ...lbl, marginBottom: 4 }}>From</div><input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} /></div>
                  <div style={{ flex: 1 }}><div style={{ ...lbl, marginBottom: 4 }}>To</div><input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} style={{ ...inp, padding: "8px 10px", fontSize: 13 }} /></div>
                  <button onClick={() => { setReportFrom(""); setReportTo(""); }} style={{ marginTop: 20, padding: "8px 10px", background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#6b7280", cursor: "pointer" }}>Clear</button>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {[["Today",0],["Yesterday",1],["Last 7 Days",7],["This Month",-1]].map(([label, d]) => (
                    <button key={label} onClick={() => {
                      const now = new Date();
                      if (d === 0) { const v = now.toISOString().slice(0,10); setReportFrom(v); setReportTo(v); }
                      else if (d === 1) { const v = new Date(now-86400000).toISOString().slice(0,10); setReportFrom(v); setReportTo(v); }
                      else if (d === 7) { setReportFrom(new Date(now-7*86400000).toISOString().slice(0,10)); setReportTo(now.toISOString().slice(0,10)); }
                      else { setReportFrom(new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10)); setReportTo(now.toISOString().slice(0,10)); }
                    }} style={{ padding: "5px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#1e40af", cursor: "pointer" }}>{label}</button>
                  ))}
                </div>
                {filteredTxns.length > 0 && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[["💰 Net Collection",f(rangeTotals.net),"#16a34a","#f0fdf4"],["🧾 Bills",rangeTotals.count+" active"+(rangeTotals.voidCount>0?" · "+rangeTotals.voidCount+" void":""),"#1e3a5f","#eff6ff"],["📋 Taxable",f(rangeTotals.taxable),"#7c3aed","#faf5ff"],["🏛 GST",f(rangeTotals.gst),"#dc2626","#fff1f2"]].map(([label,val,color,bg]) => (
                        <div key={label} style={{ background: bg, borderRadius: 12, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontWeight: 800, fontSize: 16, color }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 10 }}>💳 Payment Breakdown</div>
                      {[["💵 Cash",rangeTotals.cash,"#16a34a"],["📱 UPI",rangeTotals.upi,"#2563eb"],["💳 Card",rangeTotals.card,"#7c3aed"],["📒 Credit (Due)",rangeTotals.credit,"#dc2626"]].map(([label,val,color]) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f3f4f6" }}>
                          <span style={{ fontSize: 13, color: "#374151" }}>{label}</span><span style={{ fontWeight: 800, fontSize: 14, color }}>{f(val)}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 2, borderTop: "2px solid #e5e7eb" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>Collected (excl. credit)</span>
                        <span style={{ fontWeight: 900, fontSize: 15, color: "#1e3a5f" }}>{f(rangeTotals.cash + rangeTotals.upi + rangeTotals.card)}</span>
                      </div>
                    </div>
                    <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>🏛 GST Summary</div>
                      {[
                        ["Gross Total", f(rangeTotals.gross)],
                        ["Less Discount", f(rangeTotals.discount)],
                        ["Taxable Value", f(rangeTotals.taxable)],
                        ["CGST (Half)", f(rangeTotals.gst / 2)],
                        ["SGST (Half)", f(rangeTotals.gst / 2)],
                        ["IGST", f(0)],
                        ["Total GST", f(rangeTotals.gst)],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
                          <span style={{ color: "#6b7280" }}>{l}</span>
                          <span style={{ fontWeight: l === "Total GST" || l === "Taxable Value" ? 800 : 600, color: l === "Total GST" ? "#dc2626" : l === "Taxable Value" ? "#7c3aed" : "#111" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      <button onClick={() => exportReportExcel(filteredTxns, (reportFrom || "all") + "_to_" + (reportTo || "all"))} style={{ flex: 1, padding: "11px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Export CSV</button>
                      <button onClick={() => exportReportExcel(transactions, "ALL")} style={{ flex: 1, padding: "11px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Export All</button>
                    </div>
                  </>
                )}
                {!selectedDay ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 8 }}>📅 Day-wise</div>
                    {getFilteredDays().length === 0
                      ? <div style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>No transactions in this range</div>
                      : getFilteredDays().map((day, i) => { const t = dayTotals(grouped[day]); return (
                        <div key={day} onClick={() => setSelectedDay(day)} className="day-row" style={{ borderBottom: i < getFilteredDays().length - 1 ? "1px solid #f3f4f6" : "none", padding: "12px 8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{day}</div>
                            <div style={{ fontWeight: 800, fontSize: 15, color: "#16a34a" }}>{f(t.net)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#9ca3af" }}>
                            <span>{t.count} bill{t.count !== 1 ? "s" : ""}{t.voidCount > 0 ? " · " + t.voidCount + " void" : ""}</span>
                            {t.cash > 0 && <span>💵 {f(t.cash)}</span>}
                            {t.upi > 0 && <span>📱 {f(t.upi)}</span>}
                            {t.card > 0 && <span>💳 {f(t.card)}</span>}
                            {t.credit > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}>Due: {f(t.credit)}</span>}
                          </div>
                        </div>
                      ); })}
                  </>
                ) : (() => { const t = dayTotals(grouped[selectedDay]); return (
                  <div>
                    <button onClick={() => setSelectedDay(null)} style={{ background: "#eff6ff", border: "none", borderRadius: 8, padding: "8px 14px", color: "#1e3a5f", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>← Back to days</button>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 2 }}>{selectedDay}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{t.count} active · {t.voidCount} void</div>
                    {[["Gross Total",f(t.gross)],["Less Discount",f(t.discount)],["Taxable",f(t.taxable)],["CGST",f(t.gst/2)],["SGST",f(t.gst/2)],["IGST",f(0)],["Total GST",f(t.gst)],["Net Collection",f(t.net)]].map(([l,v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                        <span style={{ color: "#6b7280" }}>{l}</span>
                        <span style={{ fontWeight: l === "Net Collection" ? 900 : 600, color: l === "Net Collection" ? "#16a34a" : "#111", fontSize: l === "Net Collection" ? 17 : 14 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 700, fontSize: 13, color: "#1e3a5f" }}>Payment Breakup</div>
                    {[["💵 Cash",t.cash,"#16a34a"],["📱 UPI",t.upi,"#2563eb"],["💳 Card",t.card,"#7c3aed"],["📒 Credit (Due)",t.credit,"#dc2626"]].map(([m,v,c]) => (
                      <div key={m} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 0", borderBottom: "1px solid #f3f4f6" }}><span style={{ color: "#6b7280" }}>{m}</span><span style={{ fontWeight: 700, color: c }}>{f(v)}</span></div>
                    ))}
                    <button onClick={() => exportReportExcel(grouped[selectedDay], selectedDay)} style={{ width: "100%", marginTop: 14, padding: "11px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Export This Day CSV</button>
                  </div>
                ); })()}
              </div>
            )}

            {isAdmin && histView === "report" && creditReportView && (
              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <button onClick={() => setCreditReportView(false)} style={{ background: "#eff6ff", border: "none", borderRadius: 8, padding: "8px 12px", color: "#1e3a5f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>← Back</button>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>📒 Credit Report</div>
                </div>
                <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#dc2626", marginBottom: 10 }}>⚠ Customers with Outstanding</div>
                  {customers.filter(c => c.id !== "c1" && getCustomerOutstanding(c.id) > 0).length === 0
                    ? <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No outstanding credit 🎉</div>
                    : customers.filter(c => c.id !== "c1" && getCustomerOutstanding(c.id) > 0).map(c => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.phone || "No phone"}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 900, fontSize: 15, color: "#dc2626" }}>{f(getCustomerOutstanding(c.id))}</div>
                          <button onClick={() => setSettleCustomer(c)} style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Settle</button>
                        </div>
                      </div>
                    ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 4, borderTop: "2px solid #e5e7eb" }}>
                    <span style={{ fontWeight: 700, color: "#1e3a5f" }}>Total Outstanding</span>
                    <span style={{ fontWeight: 900, fontSize: 16, color: "#dc2626" }}>{f(customers.filter(c => c.id !== "c1").reduce((s, c) => s + getCustomerOutstanding(c.id), 0))}</span>
                  </div>
                </div>
                <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f", marginBottom: 10 }}>📄 Settlement History</div>
                  {settlements.length === 0
                    ? <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No settlements yet</div>
                    : settlements.map(s => (
                      <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{s.customerName}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.voucherNo} · {fmtDate(s.date)}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{s.paymentMode}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, fontSize: 14, color: "#16a34a" }}>{f(s.amount)}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>Remaining: {f(s.remainingOutstanding)}</div>
                            <button onClick={() => setShowVoucher(s)} style={{ padding: "3px 8px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", marginTop: 2 }}>👁 View</button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <button onClick={exportSettlementsCSV} style={{ width: "100%", padding: "11px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>📥 Export Settlements CSV</button>
              </div>
            )}
          </>
        )}

        {/* ── PRODUCTS TAB ── */}
        {tab === "products" && isAdmin && (
          <>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 4 }}>➕ Add Product</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>★ = Fixed GST override · Default = threshold-based ({settings.gstLow}% / {settings.gstHigh}%)</div>
              <div style={{ marginBottom: 10 }}><label style={lbl}>Product Name</label><input value={newProdName} onChange={e => setNewProdName(e.target.value)} placeholder="e.g. Silk Saree" style={inp} /></div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>GST Rate</label><GstSelect value={newProdGst} onChange={setNewProdGst} /></div>
              {prodMsg && <div style={{ fontSize: 13, marginBottom: 8, color: prodMsg.includes("added") ? "#16a34a" : "#dc2626", background: prodMsg.includes("added") ? "#f0fdf4" : "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>{prodMsg.includes("added") ? "✅ " : "⚠ "}{prodMsg}</div>}
              <button onClick={async () => {
                setProdMsg("");
                if (!newProdName.trim()) return setProdMsg("Name required.");
                if (products.find(p => p.name.toLowerCase() === newProdName.trim().toLowerCase())) return setProdMsg("Already exists.");
                const np = { id: genId(), name: newProdName.trim(), gstOverride: newProdGst === "default" ? null : parseFloat(newProdGst) };
                await insertProduct(shopCode, np);
                setProducts(p => [...p, np]); setProdMsg(`"${np.name}" added!`); setNewProdName(""); setNewProdGst("default");
              }} style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Add Product</button>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>📦 Products ({products.length})</div>
              {products.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No products yet.</div>}
              {products.map((p, i) => (
                <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: i < products.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: p.gstOverride !== null && p.gstOverride !== undefined ? "#7c3aed" : "#9ca3af" }}>{p.gstOverride !== null && p.gstOverride !== undefined ? `★ Fixed: ${p.gstOverride}%` : "Default (threshold-based)"}</div>
                  </div>
                  <GstSelect value={p.gstOverride} onChange={v => updateProduct(shopCode, { ...p, gstOverride: v === "default" ? null : parseFloat(v) }).then(() => setProducts(prev => prev.map(pr => pr.id === p.id ? { ...pr, gstOverride: v === "default" ? null : parseFloat(v) } : pr)))} />
                  <button onClick={() => { if (window.confirm(`Delete "${p.name}"?`)) deleteProduct(shopCode, p.id).then(() => setProducts(prev => prev.filter(pr => pr.id !== p.id))); }}
                    style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && isAdmin && (
          <>
            <div style={{ background: "#fef3c7", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🏪 <b>{shopCode}</b></span>
              <button onClick={handleChangeShop} style={{ background: "none", border: "1px solid #92400e", borderRadius: 6, color: "#92400e", padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>Switch Shop</button>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🏪 Shop Info</div>
              {[["shopName","Shop Name"],["shopTagline","Tagline / Slogan"],["shopAddress","Address"],["shopPhone","Phone"],["shopEmail","Email"],["gstin","GSTIN"],["stateCode","State Code"]].map(([k, l]) => (
                <div key={k} style={{ marginBottom: 10 }}><label style={lbl}>{l}</label><input value={draftSettings[k] || ""} onChange={e => setDraftSettings(p => ({ ...p, [k]: e.target.value }))} style={inp} /></div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🧾 Invoice Footer</div>
              {[["footerNote","Footer Note"],["signoff","Sign-off Text"]].map(([k, l]) => (
                <div key={k} style={{ marginBottom: 10 }}><label style={lbl}>{l}</label><input value={draftSettings[k] || ""} onChange={e => setDraftSettings(p => ({ ...p, [k]: e.target.value }))} style={inp} /></div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🏛 GST Config</div>
              {[["gstLow","GST Low Rate (%)"],["gstHigh","GST High Rate (%)"],["gstThreshold","Taxable Threshold (₹)"]].map(([k, l]) => (
                <div key={k} style={{ marginBottom: 10 }}><label style={lbl}>{l}</label><input type="number" value={draftSettings[k]} onChange={e => setDraftSettings(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))} style={inp} /></div>
              ))}
              <div style={{ background: "#eff6ff", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#1e40af" }}>
                <b>Rule:</b> If item (after discount) ≥ {settings.currency}{(settings.gstThreshold * (1 + settings.gstLow / 100)).toFixed(0)} → {settings.gstHigh}% GST, otherwise {settings.gstLow}%
              </div>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>⚙️ Billing Options</div>
              <div style={{ marginBottom: 10 }}><label style={lbl}>Currency Symbol</label><input value={draftSettings.currency} onChange={e => setDraftSettings(p => ({ ...p, currency: e.target.value }))} style={{ ...inp, width: 80 }} /></div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Default Payment Mode</label>
                <select value={draftSettings.defaultPaymentMode} onChange={e => setDraftSettings(p => ({ ...p, defaultPaymentMode: e.target.value }))} style={inp}>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f9fafb", borderRadius: 8 }}>
                <input type="checkbox" id="disc" checked={draftSettings.enableDiscount} onChange={e => setDraftSettings(p => ({ ...p, enableDiscount: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "#1e3a5f" }} />
                <label htmlFor="disc" style={{ fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Enable Discount Field</label>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>🔐 Change PINs</div>
              {[["adminPin","New Admin PIN",newAdminPin,setNewAdminPin],["staffPin","New Staff PIN",newStaffPin,setNewStaffPin]].map(([k,l,val,setter]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <label style={lbl}>{l}</label>
                  <input type="password" maxLength={4} value={val} onChange={e => setter(e.target.value.replace(/\D/g,"").slice(0,4))}
                    placeholder="Leave blank to keep current" style={{ ...inp, width: 140, letterSpacing: 6, fontSize: 18 }} inputMode="numeric" />
                </div>
              ))}
            </div>
            <button onClick={handleSaveSettings} style={{ width: "100%", padding: "14px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>💾 Save Settings</button>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", zIndex: 50, boxShadow: "0 -2px 8px rgba(0,0,0,0.06)" }}>
        {navTabs.map(([key, icon, l]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: "10px 0 8px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: tab === key ? "#1e3a5f" : "#9ca3af", borderTop: tab === key ? "2px solid #1e3a5f" : "2px solid transparent" }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: tab === key ? 800 : 500 }}>{l}</span>
          </button>
        ))}
      </div>

      {/* Modals */}
      {showReceipt && <InvoiceView txn={showReceipt} settings={settings} onClose={() => setShowReceipt(null)} />}
      {editTxn && <EditInvoiceModal txn={editTxn} products={products} settings={settings} onSave={handleEditSave} onCancel={() => setEditTxn(null)} onVoidInvoice={() => handleVoidInvoice(editTxn)} />}
      {settleCustomer && <CreditSettleModal customer={settleCustomer} outstanding={getCustomerOutstanding(settleCustomer.id)} settings={settings} onConfirm={handleSettle} onCancel={() => setSettleCustomer(null)} />}
      {showVoucher && <ReceiptVoucher voucher={showVoucher} settings={settings} onClose={() => setShowVoucher(null)} />}

      {/* Customer Ledger Modal */}
      {showLedger && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setShowLedger(null); }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#1e3a5f", marginBottom: 2 }}>📒 Ledger — {showLedger.name}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{showLedger.phone || "No phone"}</div>
            {(() => {
              const custTxns = transactions.filter(t => (t.customer?.id === showLedger.id || t.customerId === showLedger.id) && !t.void && !t.cancelled).sort((a, b) => new Date(a.date) - new Date(b.date));
              const custSetts = settlements.filter(s => s.customerId === showLedger.id).sort((a, b) => new Date(a.date) - new Date(b.date));
              const entries = [
                ...custTxns.map(t => ({ date: t.date, type: "bill", label: t.invoiceNo, debit: t.total || 0, credit: 0, paymentMode: t.paymentMode })),
                ...custSetts.map(s => ({ date: s.date, type: "settlement", label: s.voucherNo, debit: 0, credit: s.amount, paymentMode: s.paymentMode })),
              ].sort((a, b) => new Date(a.date) - new Date(b.date));
              let balance = 0;
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 11, fontWeight: 700, color: "#6b7280", padding: "6px 0", borderBottom: "2px solid #e5e7eb", marginBottom: 4 }}>
                    <span>Date</span><span>Details</span><span style={{ textAlign: "right" }}>Billed</span><span style={{ textAlign: "right" }}>Settled</span>
                  </div>
                  {entries.map((e, i) => {
                    if (e.type === "bill") {
                      const creditPart = transactions.find(t => t.invoiceNo === e.label);
                      const creditAmt = creditPart ? payAmt(creditPart, "Credit") : 0;
                      balance += creditAmt;
                    } else { balance -= e.credit; }
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, fontSize: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6", background: e.type === "settlement" ? "#f0fdf4" : "transparent" }}>
                        <span style={{ color: "#9ca3af" }}>{fmtDate(e.date)}</span>
                        <span style={{ fontWeight: 600 }}>{e.label}<br /><span style={{ fontSize: 10, color: "#9ca3af" }}>{e.paymentMode}</span></span>
                        <span style={{ textAlign: "right", color: "#dc2626", fontWeight: e.debit > 0 ? 700 : 400 }}>{e.debit > 0 ? f(e.debit) : "-"}</span>
                        <span style={{ textAlign: "right", color: "#16a34a", fontWeight: e.credit > 0 ? 700 : 400 }}>{e.credit > 0 ? f(e.credit) : "-"}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #e5e7eb", marginTop: 4, fontWeight: 800, fontSize: 15 }}>
                    <span>Outstanding Balance</span>
                    <span style={{ color: getCustomerOutstanding(showLedger.id) > 0 ? "#dc2626" : "#16a34a" }}>{f(getCustomerOutstanding(showLedger.id))}</span>
                  </div>
                </>
              );
            })()}
            <button onClick={() => setShowLedger(null)} style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
