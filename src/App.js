import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://vpodgzbpkqhkmhlvefnu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwb2RnemJwa3Foa21obHZlZm51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NzAzMTEsImV4cCI6MjA4ODM0NjMxMX0.ve16_iu5Gsv47Au3AInU5-jTvoY3rACEtan6WdcmV9E";
const hdrs = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Prefer": "return=representation"
};
const SB = (path) => SUPABASE_URL + "/rest/v1/" + path;

function scopedId(shopCode, id) { return shopCode + "::" + id; }

async function sbGet(table, shopCode, id) {
  try {
    const r = await fetch(SB(table) + "?id=eq." + encodeURIComponent(scopedId(shopCode, id)), { headers: hdrs });
    const d = await r.json();
    return d && d.length > 0 ? d[0].data : null;
  } catch { return null; }
}
async function sbUpsert(table, shopCode, id, data) {
  try {
    await fetch(SB(table), {
      method: "POST",
      headers: { ...hdrs, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: scopedId(shopCode, id), data })
    });
  } catch {}
}
async function sbGetAll(table, shopCode) {
  try {
    const r = await fetch(SB(table) + "?id=like." + encodeURIComponent(shopCode + "::") + "*&order=created_at.desc", { headers: hdrs });
    const d = await r.json();
    return Array.isArray(d) ? d.map(row => row.data) : [];
  } catch { return []; }
}
async function sbInsert(table, shopCode, data) {
  try {
    await fetch(SB(table), {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ id: scopedId(shopCode, data.id), data })
    });
  } catch {}
}
async function sbDelete(table, shopCode, id) {
  try {
    await fetch(SB(table) + "?id=eq." + encodeURIComponent(scopedId(shopCode, id)), { method: "DELETE", headers: hdrs });
  } catch {}
}
async function sbGetAllProducts(shopCode) {
  try {
    const r = await fetch(SB("products") + "?id=like." + encodeURIComponent(shopCode + "::") + "*&order=created_at.asc", { headers: hdrs });
    const d = await r.json();
    return Array.isArray(d) ? d.map(row => row.data) : [];
  } catch { return []; }
}
async function sbInsertProduct(shopCode, prod) {
  try {
    await fetch(SB("products"), {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ id: scopedId(shopCode, prod.id), data: prod })
    });
  } catch {}
}
async function sbUpdateProduct(shopCode, prod) {
  try {
    await fetch(SB("products"), {
      method: "POST",
      headers: { ...hdrs, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: scopedId(shopCode, prod.id), data: prod })
    });
  } catch {}
}
async function sbDeleteProduct(shopCode, id) {
  try {
    await fetch(SB("products") + "?id=eq." + encodeURIComponent(scopedId(shopCode, id)), { method: "DELETE", headers: hdrs });
  } catch {}
}

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Credit"];
const defaultSettings = {
  shopName: "MY SHOP",
  shopTagline: "",
  shopAddress: "",
  shopPhone: "",
  gstin: "",
  stateCode: "",
  footerNote: "",
  signoff: "For MY SHOP",
  gstLow: 5,
  gstHigh: 18,
  gstThreshold: 2500,
  currency: "₹",
  enableDiscount: true,
  defaultPaymentMode: "Cash",
  adminPin: "1234",
  staffPin: "0000"
};

function fmt(n, cur) { return (cur !== undefined ? cur : "₹") + Number(n).toFixed(2); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function getFinYear() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth(), s = m >= 3 ? y : y - 1;
  return s + "-" + String(s + 1).slice(2);
}
function genInvoiceNo(txns) {
  const fy = getFinYear();
  const nums = txns.filter(t => t.invoiceNo && t.invoiceNo.startsWith(fy + "/")).map(t => parseInt(t.invoiceNo.split("/")[1]) || 0);
  return fy + "/" + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(2, "0");
}
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

const inp = { padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, width: "100%", boxSizing: "border-box", background: "#fff" };
const card = { background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" };
const lbl = { fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 };
const BDR = "1px solid #000";
const tds = (extra) => ({ ...extra, border: BDR, padding: "4px 6px", fontSize: 11 });

const GstSelect = ({ value, onChange }) => (
  <select value={value === null || value === undefined ? "default" : String(value)} onChange={e => onChange(e.target.value)}
    style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
    <option value="default">Default</option>
    {["0","5","12","18","28"].map(v => <option key={v} value={v}>{v}%</option>)}
  </select>
);

// ── Shop Code / Registration Screen ────────────────────────────────────────
function ShopCodeScreen({ onEnter }) {
  const [screen, setScreen] = useState("enter");
  const [code, setCode] = useState("");
  const [shopName, setShopName] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [adminPin2, setAdminPin2] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);

  const checkCode = async () => {
    const clean = code.trim().toUpperCase().replace(/\s+/g, "");
    if (clean.length < 4) { setErr("Shop code must be at least 4 characters."); return; }
    setChecking(true); setErr("");
    try {
      const r = await fetch(SB("settings") + "?id=eq." + encodeURIComponent(clean + "::main"), { headers: hdrs });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      if (!Array.isArray(d) || d.length === 0) {
        setChecking(false);
        setScreen("notfound");
        return;
      }
    } catch (e) {
      setChecking(false);
      setErr("Could not connect: " + e.message);
      return;
    }
    setChecking(false);
    onEnter(code.trim().toUpperCase().replace(/\s+/g, ""));
  };

  const registerShop = async () => {
    const clean = code.trim().toUpperCase().replace(/\s+/g, "");
    setErr("");
    if (!shopName.trim()) { setErr("Shop name is required."); return; }
    if (!adminPin.match(/^\d{4}$/)) { setErr("Admin PIN must be exactly 4 digits."); return; }
    if (adminPin !== adminPin2) { setErr("PINs do not match."); return; }
    setRegistering(true);
    try {
      const newSettings = { ...defaultSettings, shopName: shopName.trim(), adminPin, signoff: "For " + shopName.trim() };
      await fetch(SB("settings"), {
        method: "POST",
        headers: { ...hdrs, "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ id: clean + "::main", data: newSettings })
      });
      await fetch(SB("customers"), {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ id: clean + "::c1", data: { id: "c1", name: "Walk-in Customer", phone: "" } })
      });
      setRegistering(false);
      onEnter(clean);
    } catch {
      setRegistering(false);
      setErr("Registration failed. Check your internet and try again.");
    }
  };

  if (screen === "notfound") return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif", padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🧵</div>
      <div style={{ fontWeight: 900, fontSize: 26, color: "#1e3a5f", marginBottom: 24 }}>FabricBill</div>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", width: "100%", maxWidth: 340, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 6 }}>Shop Not Found</div>
        <div style={{ background: "#e0f2fe", borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 16, color: "#0369a1", letterSpacing: 2, marginBottom: 10 }}>{code.trim().toUpperCase()}</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>No shop registered with this code. Check for typos, or register as a new shop.</div>
        <button onClick={() => setScreen("register")} style={{ width: "100%", padding: "13px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 10 }}>🏪 Register This Shop Code</button>
        <button onClick={() => { setScreen("enter"); setErr(""); }} style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Try a Different Code</button>
      </div>
    </div>
  );

  if (screen === "register") return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif", padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🧵</div>
      <div style={{ fontWeight: 900, fontSize: 26, color: "#1e3a5f", marginBottom: 4 }}>Register New Shop</div>
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24, textAlign: "center" }}>Setting up: <b style={{ color: "#0369a1" }}>{code.trim().toUpperCase()}</b></div>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", width: "100%", maxWidth: 340 }}>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Shop Name</label><input value={shopName} onChange={e => { setShopName(e.target.value); setErr(""); }} placeholder="e.g. MEGHDOOT" style={inp} autoFocus /></div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Admin PIN (4 digits)</label><input type="password" inputMode="numeric" maxLength={4} value={adminPin} onChange={e => { setAdminPin(e.target.value.replace(/\D/,"").slice(0,4)); setErr(""); }} placeholder="****" style={{ ...inp, letterSpacing: 8, fontSize: 18, width: 130 }} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Confirm Admin PIN</label><input type="password" inputMode="numeric" maxLength={4} value={adminPin2} onChange={e => { setAdminPin2(e.target.value.replace(/\D/,"").slice(0,4)); setErr(""); }} placeholder="****" style={{ ...inp, letterSpacing: 8, fontSize: 18, width: 130 }} /></div>
        {err && <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626", marginBottom: 12 }}>⚠ {err}</div>}
        <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#166534", marginBottom: 16 }}>ℹ️ Default Staff PIN is <b>0000</b>. Change it later in Settings.</div>
        <button onClick={registerShop} disabled={registering} style={{ width: "100%", padding: "13px 0", background: registering ? "#9ca3af" : "#16a34a", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: registering ? "not-allowed" : "pointer", marginBottom: 10 }}>{registering ? "Creating Shop..." : "✅ Create Shop"}</button>
        <button onClick={() => { setScreen("enter"); setErr(""); }} style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← Back</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif", padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🧵</div>
      <div style={{ fontWeight: 900, fontSize: 26, color: "#1e3a5f", marginBottom: 4 }}>FabricBill</div>
      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 36, textAlign: "center" }}>Enter your Shop Code to access your billing account</div>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", width: "100%", maxWidth: 340 }}>
        <label style={{ ...lbl, marginBottom: 8 }}>Shop Code</label>
        <input value={code} onChange={e => { setCode(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && checkCode()} placeholder="e.g. MEGHDOOT2024" style={{ ...inp, fontSize: 18, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }} autoFocus />
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>💡 Enter your shop's unique code exactly as registered.</div>
        {err && <div style={{ background: "#fee2e2", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626", marginBottom: 12 }}>⚠ {err}</div>}
        <button onClick={checkCode} disabled={checking} style={{ width: "100%", padding: "13px 0", background: checking ? "#9ca3af" : "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: checking ? "not-allowed" : "pointer" }}>{checking ? "Checking..." : "Enter Shop →"}</button>
      </div>
    </div>
  );
}

// ── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, settings, shopCode, onChangeShop }) {
  const [role, setRole] = useState(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const correct = role === "admin" ? (settings.adminPin || "1234") : (settings.staffPin || "0000");
    if (pin === correct) onLogin(role);
    else { setErr("Wrong PIN. Try again."); setPin(""); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, sans-serif" }}>
      <div style={{ fontSize: 36, marginBottom: 4 }}>🧵</div>
      <div style={{ fontWeight: 900, fontSize: 22, color: "#1e3a5f", marginBottom: 2 }}>FabricBill</div>
      <div style={{ background: "#e0f2fe", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700, color: "#0369a1", marginBottom: 4 }}>🏪 {shopCode}</div>
      <button onClick={onChangeShop} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 11, cursor: "pointer", marginBottom: 24 }}>← Change Shop</button>
      {!role ? (
        <div style={{ display: "flex", gap: 16 }}>
          {[["admin","🔐","Admin","#1e3a5f"],["staff","👤","Staff","#16a34a"]].map(([r,icon,label,bg]) => (
            <button key={r} onClick={() => { setRole(r); setPin(""); setErr(""); }}
              style={{ width: 130, height: 130, borderRadius: 16, border: "none", background: bg, color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
              <span style={{ fontSize: 36 }}>{icon}</span>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", width: 280, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{role === "admin" ? "🔐 Admin" : "👤 Staff"} PIN</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 20, marginTop: 8 }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: pin.length > i ? "#1e3a5f" : "#e5e7eb" }} />)}
          </div>
          {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, justifyItems: "center", marginBottom: 12 }}>
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <button key={d} onClick={() => { if (pin.length < 4) setPin(p => p + String(d)); }}
                style={{ width: 64, height: 64, borderRadius: "50%", border: "none", background: "#f3f4f6", color: "#1e3a5f", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>{d}</button>
            ))}
            <button onClick={() => setPin(p => p.slice(0,-1))} style={{ width: 64, height: 64, borderRadius: "50%", border: "none", background: "#fee2e2", color: "#dc2626", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>⌫</button>
            <button onClick={() => { if (pin.length < 4) setPin(p => p + "0"); }} style={{ width: 64, height: 64, borderRadius: "50%", border: "none", background: "#f3f4f6", color: "#1e3a5f", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>0</button>
            <button onClick={submit} style={{ width: 64, height: 64, borderRadius: "50%", border: "none", background: "#1e3a5f", color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>✓</button>
          </div>
          <button onClick={() => { setRole(null); setPin(""); setErr(""); }} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>← Back</button>
        </div>
      )}
    </div>
  );
}

// ── Invoice View ────────────────────────────────────────────────────────────
function InvoiceView({ txn, settings, onClose }) {
  const [showBt, setShowBt] = useState(false);
  const f = (n) => fmt(n, settings.currency);
  const cgst = Math.round(txn.gst * 50) / 100;
  const sgst = Math.round(txn.gst * 50) / 100;
  const netDisplay = Math.round(txn.total);
  const blRate = txn.taxable > 0 ? (txn.gst / txn.taxable) * 100 : 0;
  const halfRate = (blRate / 2).toFixed(1);
  const amtWords = numToWords(Math.round(txn.total)) + " Rupees Only";

  const doPrint = () => {
    const el = document.getElementById("inv-print");
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Invoice ${txn.invoiceNo}</title>
      <style>body{font-family:monospace;margin:20px;}table{width:100%;border-collapse:collapse;}
      td,th{border:1px solid #000;padding:4px 6px;font-size:11px;}
      @media print{button{display:none;}}</style></head><body>
      ${el.innerHTML}<br/>
      <button onclick="window.print();window.close();" style="padding:10px 24px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Print / Save PDF</button></body></html>`);
    win.document.close();
  };

  const doSharePDF = async () => {
    const el = document.getElementById("inv-print");
    if (!window.html2canvas) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    if (!window.jspdf) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    try {
      const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
      const pdfBlob = pdf.output("blob");
      const file = new File([pdfBlob], "Invoice-" + txn.invoiceNo.replace("/", "-") + ".pdf", { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "Invoice " + txn.invoiceNo, text: "Invoice from " + settings.shopName, files: [file] });
      } else {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a"); a.href = url; a.download = "Invoice-" + txn.invoiceNo.replace("/", "-") + ".pdf"; a.click(); URL.revokeObjectURL(url);
        alert("PDF downloaded!");
      }
    } catch { alert("Could not generate PDF. Please use Print option."); }
  };

  const doWhatsApp = () => {
    const halfRate2 = (blRate / 2).toFixed(1);
    let msg = "🧵 *" + settings.shopName + "*\n_" + (settings.shopTagline || "") + "_\n" + settings.shopAddress + "\nGSTIN: " + settings.gstin + "\n─────────────────────\n🧾 *INVOICE: " + txn.invoiceNo + "*\n📅 Date: " + new Date(txn.date).toLocaleDateString("en-IN") + "\n👤 Buyer: *" + txn.customer.name + "*\n";
    if (txn.customer.phone) msg += "📞 Ph: " + txn.customer.phone + "\n";
    msg += "─────────────────────\n*Items:*\n";
    txn.items.forEach((item, i) => { msg += (i+1) + ". " + item.name + "\n   " + item.qty + " x " + f(item.price) + " = *" + f(item.price * item.qty) + "* (GST " + (item.gstRate*100).toFixed(0) + "%)\n"; });
    msg += "─────────────────────\nGross Total: " + f(txn.subtotal) + "\n";
    if (txn.discount > 0) msg += "Discount: -" + f(txn.discount) + "\n";
    msg += "Taxable Value: " + f(txn.taxable) + "\nCGST @" + halfRate2 + "%: " + f(cgst) + "\nSGST @" + halfRate2 + "%: " + f(sgst) + "\n";
    if (txn.roundOff && txn.roundOff !== 0) msg += "Round Off: " + (txn.roundOff > 0 ? "+" : "") + f(txn.roundOff) + "\n";
    msg += "─────────────────────\n💰 *Net Amount: " + f(Math.round(txn.total)) + "*\n💳 Payment: " + txn.paymentMode + "\n─────────────────────\n_" + amtWords + "_\n\n" + settings.footerNote + "\n*" + settings.signoff + "*";
    window.open(txn.customer.phone ? "https://wa.me/91" + txn.customer.phone + "?text=" + encodeURIComponent(msg) : "https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
  };

  const doThermal = () => {
    const W = 32, line = "-".repeat(W), ctr = s => " ".repeat(Math.max(0,Math.floor((W-s.length)/2)))+s, row = (l,r) => l+" ".repeat(Math.max(1,W-l.length-r.length))+r;
    let t = ctr(settings.shopName)+"\n"+ctr(settings.shopTagline||"")+"\n"+ctr(settings.shopAddress||"")+"\n"+ctr("GSTIN: "+settings.gstin)+"\n"+line+"\n";
    t += "Invoice: "+txn.invoiceNo+"\nDate: "+new Date(txn.date).toLocaleDateString("en-IN")+"\nBuyer: "+txn.customer.name+"\n";
    if (txn.customer.phone) t += "Ph: "+txn.customer.phone+"\n";
    t += line+"\n";
    txn.items.forEach(item => { const desc=item.name+" ("+item.qty+"x"+item.price.toFixed(2)+")", amt=(item.price*item.qty).toFixed(2); t+=row(desc.slice(0,W-amt.length-1),amt)+"\n  GST: "+(item.gstRate*100).toFixed(0)+"%\n"; });
    t += line+"\n";
    if (txn.discount>0) t+=row("Discount","-"+fmt(txn.discount,""))+"\n";
    t += row("Taxable",fmt(txn.taxable,""))+"\n"+row("CGST "+halfRate+"%",fmt(cgst,""))+"\n"+row("SGST "+halfRate+"%",fmt(sgst,""))+"\n";
    if (txn.roundOff&&txn.roundOff!==0) t+=row("Round Off",(txn.roundOff>0?"+":"")+fmt(txn.roundOff,""))+"\n";
    t += line+"\n"+row("NET","INR "+fmt(txn.total,""))+"\n"+line+"\nPayment: "+txn.paymentMode+"\n\nAmt: "+amtWords+"\n"+line+"\n"+ctr(settings.footerNote||"")+"\n"+ctr(settings.signoff||"")+"\n\n\n";
    return t;
  };

  const summaryRows = [
    ["Gross Total", f(txn.subtotal)],
    ...(txn.discount > 0 ? [["Less Discount", f(txn.discount)]] : []),
    ["Taxable Value", f(txn.taxable)],
    ["CGST @ " + halfRate + "%", f(cgst)],
    ["SGST @ " + halfRate + "%", f(sgst)],
    ["IGST @", "—"],
    ...(txn.roundOff && txn.roundOff !== 0 ? [["Round Off", (txn.roundOff > 0 ? "+" : "") + f(txn.roundOff)]] : []),
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", overflowY: "auto" }}>
        <div id="inv-print" style={{ border: "2px solid #000", padding: 10, fontFamily: "monospace", fontSize: 11 }}>
          <div style={{ textAlign: "center", borderBottom: BDR, paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ position: "relative", fontSize: 10, marginBottom: 4, minHeight: 16 }}>
              <span style={{ position: "absolute", left: 0 }}>STATE CODE : {settings.stateCode || "20"}</span>
              <span style={{ fontWeight: 700 }}>TAX INVOICE</span>
            </div>
            <div style={{ fontWeight: 900, fontSize: 32, letterSpacing: 12, fontFamily: "Georgia, serif", textShadow: "2px 2px 4px rgba(0,0,0,0.3)" }}>{settings.shopName}</div>
            {settings.shopTagline && <div style={{ fontSize: 10, fontStyle: "italic", fontWeight: 700 }}>{settings.shopTagline}</div>}
            <div style={{ fontSize: 10, fontWeight: 700 }}>{settings.shopAddress}</div>
            {settings.shopPhone && <div style={{ fontSize: 10 }}>Ph: {settings.shopPhone}</div>}
            {settings.gstin && <div style={{ fontSize: 10, fontWeight: 700 }}>GSTIN : {settings.gstin}</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span><b>Invoice No:</b> {txn.invoiceNo}</span><span><b>Date:</b> {new Date(txn.date).toLocaleDateString("en-IN")}</span></div>
          <div style={{ marginBottom: 4 }}><b>Buyer:</b> {txn.customer.name}</div>
          {txn.customer.phone && <div style={{ marginBottom: 2 }}><b>Ph:</b> {txn.customer.phone}</div>}
          <div style={{ marginBottom: 6 }}><b>Address:</b> ............................................</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f3f4f6" }}>
              {["Sl.","Particulars","HSN","Qty","Rate","Amount"].map((h,i) => (
                <th key={h} style={tds({ textAlign: i>=3?"right":i===0?"center":"left", fontWeight: 700 })}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txn.items.map((item, idx) => (
                <tr key={item.uid}>
                  <td style={tds({ textAlign:"center" })}>{idx+1}</td>
                  <td style={tds({})}>{item.name}</td>
                  <td style={tds({ textAlign:"center" })}>—</td>
                  <td style={tds({ textAlign:"right" })}>{item.qty}</td>
                  <td style={tds({ textAlign:"right" })}>{item.price.toFixed(2)}</td>
                  <td style={tds({ textAlign:"right", fontWeight:600 })}>{(item.price*item.qty).toFixed(2)}</td>
                </tr>
              ))}
              {Array(Math.max(0,4-txn.items.length)).fill(0).map((_,i) => (
                <tr key={"e"+i}>{[0,1,2,3,4,5].map(c=><td key={c} style={tds({height:20})}>&nbsp;</td>)}</tr>
              ))}
            </tbody>
          </table>
          <div style={{ display:"flex", borderLeft:BDR, borderRight:BDR, borderBottom:BDR }}>
            <div style={{ flex:1, padding:"6px 8px", borderRight:BDR, fontSize:10 }}><b>Amount in Words:</b><br />{amtWords}</div>
            <div style={{ width:200 }}>
              {summaryRows.map(([label,val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", borderBottom:BDR, padding:"3px 6px", fontSize:10 }}>
                  <span>{label}</span><span style={{ fontWeight:600 }}>{val}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 6px", fontWeight:900, fontSize:12 }}><span>Net Value</span><span>{f(netDisplay)}</span></div>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:6, paddingTop:6, fontSize:9 }}>
            <span>{settings.footerNote}</span>
            <span style={{ textAlign:"right" }}><div style={{ marginBottom:28 }}><b>{settings.signoff}</b></div><div>Authorised Signatory</div></span>
          </div>
          <div style={{ borderTop:BDR, marginTop:4, paddingTop:4, fontSize:9, textAlign:"center" }}>Certified that details given above are true and correct.</div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:14 }}>
          <button onClick={doPrint} style={{ flex:1, padding:"13px 0", background:"#16a34a", color:"#fff", border:"none", borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer" }}>🖨️ Print</button>
          <button onClick={doWhatsApp} style={{ flex:1, padding:"13px 0", background:"#25d366", color:"#fff", border:"none", borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer" }}>💬 WA Text</button>
          <button onClick={doSharePDF} style={{ flex:1, padding:"13px 0", background:"#128c7e", color:"#fff", border:"none", borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer" }}>📄 WA PDF</button>
          <button onClick={() => setShowBt(true)} style={{ flex:1, padding:"13px 0", background:"#2563eb", color:"#fff", border:"none", borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer" }}>🖨️ Thermal</button>
          <button onClick={onClose} style={{ flex:1, padding:"13px 0", background:"#1e3a5f", color:"#fff", border:"none", borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer" }}>✖ Close</button>
        </div>
        {showBt && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
            <div style={{ background:"#fff", borderRadius:"16px 16px 0 0", padding:16, width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"80vh", overflowY:"auto" }}>
              <div style={{ fontWeight:800, fontSize:16, color:"#1e3a5f", marginBottom:4 }}>📲 Bluetooth Thermal Print</div>
              <pre style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:8, padding:10, fontSize:11, overflowX:"auto", marginBottom:12, maxHeight:280, overflowY:"auto", whiteSpace:"pre-wrap" }}>{doThermal()}</pre>
              <button onClick={() => navigator.clipboard.writeText(doThermal()).then(() => alert("Copied!"))} style={{ width:"100%", padding:"12px 0", background:"#2563eb", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:800, cursor:"pointer", marginBottom:8 }}>📋 Copy to Clipboard</button>
              <button onClick={() => setShowBt(false)} style={{ width:"100%", padding:"11px 0", background:"#f3f4f6", color:"#374151", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [shopCode, setShopCode] = useState(() => {
    try { return localStorage.getItem("fabricbill_shopcode") || null; } catch { return null; }
  });
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [role, setRole] = useState(() => {
    try {
      const saved = localStorage.getItem("fabricbill_session");
      if (!saved) return null;
      const { role, expiry } = JSON.parse(saved);
      if (Date.now() < expiry) return role;
      localStorage.removeItem("fabricbill_session");
      return null;
    } catch { return null; }
  });
  const [tab, setTab] = useState("billing");
  const [settings, setSettings] = useState(defaultSettings);
  const [draftSettings, setDraftSettings] = useState(defaultSettings);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("c1");
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [discount, setDiscount] = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [showReceipt, setShowReceipt] = useState(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [custError, setCustError] = useState("");
  const [custSuccess, setCustSuccess] = useState("");
  const [newProdName, setNewProdName] = useState("");
  const [newProdGst, setNewProdGst] = useState("default");
  const [prodMsg, setProdMsg] = useState("");
  const [histView, setHistView] = useState("bills");
  const [selectedDay, setSelectedDay] = useState(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");

  const isAdmin = role === "admin";
  const f = (n) => fmt(n, settings.currency);

  const handleEnterShop = (code) => {
    try { localStorage.setItem("fabricbill_shopcode", code); } catch {}
    setShopCode(code);
    setReady(false);
  };

  const handleChangeShop = () => {
    try { localStorage.removeItem("fabricbill_shopcode"); localStorage.removeItem("fabricbill_session"); } catch {}
    setShopCode(null); setRole(null); setReady(false);
    setTransactions([]); setCustomers([]); setProducts([]);
    setSettings(defaultSettings); setDraftSettings(defaultSettings);
  };

  useEffect(() => {
    if (!shopCode) return;
    setReady(false);
    (async () => {
      setSyncStatus("syncing");
      try {
        const [s, txns, custs, prods] = await Promise.all([
          sbGet("settings", shopCode, "main"),
          sbGetAll("transactions", shopCode),
          sbGetAll("customers", shopCode),
          sbGetAllProducts(shopCode),
        ]);
        const merged = { ...defaultSettings, ...(s || {}) };
        setSettings(merged); setDraftSettings(merged);
        setTransactions(txns || []);
        setCustomers(custs && custs.length > 0 ? custs : [{ id: "c1", name: "Walk-in Customer", phone: "" }]);
        setProducts(prods || []);
        setPaymentMode(merged.defaultPaymentMode);
        setSyncStatus("ok");
      } catch { setSyncStatus("error"); }
      setReady(true);
    })();
  }, [shopCode]);

  const saveSettings = useCallback(async (d) => {
    setSettings(d); setSyncStatus("syncing");
    await sbUpsert("settings", shopCode, "main", d); setSyncStatus("ok");
  }, [shopCode]);

  const addProduct = useCallback(async (prod) => {
    const np = { ...prod, id: genId() };
    setProducts(p => [...p, np]); setSyncStatus("syncing");
    await sbInsertProduct(shopCode, np); setSyncStatus("ok");
    return np;
  }, [shopCode]);

  const updateProduct = useCallback(async (upd) => {
    setProducts(p => p.map(pr => pr.id === upd.id ? upd : pr)); setSyncStatus("syncing");
    await sbUpdateProduct(shopCode, upd); setSyncStatus("ok");
  }, [shopCode]);

  const removeProduct = useCallback(async (id) => {
    setProducts(p => p.filter(pr => pr.id !== id)); setSyncStatus("syncing");
    await sbDeleteProduct(shopCode, id); setSyncStatus("ok");
  }, [shopCode]);

  const saveCustomers = useCallback(async (d) => {
    setCustomers(d); setSyncStatus("syncing");
    await Promise.all(d.map(c => sbUpsert("customers", shopCode, c.id, c))); setSyncStatus("ok");
  }, [shopCode]);

  const addTransaction = useCallback(async (txn) => {
    const upd = [txn, ...transactions];
    setTransactions(upd); setSyncStatus("syncing");
    await sbInsert("transactions", shopCode, txn); setSyncStatus("ok");
  }, [transactions, shopCode]);

  const deleteTransaction = useCallback(async (id) => {
    const upd = transactions.filter(t => t.id !== id);
    setTransactions(upd); setSyncStatus("syncing");
    await sbDelete("transactions", shopCode, id); setSyncStatus("ok");
  }, [transactions, shopCode]);

  const getGstRate = (name, price) => {
    const prod = products.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (prod && prod.gstOverride !== null && prod.gstOverride !== undefined) return prod.gstOverride / 100;
    return (parseFloat(price) || 0) >= settings.gstThreshold ? settings.gstHigh / 100 : settings.gstLow / 100;
  };

  const cartWithTax = cart.map(item => {
    const price = parseFloat(item.price)||0, qty = parseFloat(item.qty)||0, subtotal = price*qty;
    const rate = getGstRate(item.name, price);
    return { ...item, price, qty, subtotal, gstRate: rate, total: subtotal*(1+rate) };
  });
  const grandSubtotal = cartWithTax.reduce((s,i) => s+i.subtotal, 0);
  const blendedRate = grandSubtotal > 0 ? cartWithTax.reduce((s,i) => s+(i.subtotal/grandSubtotal)*i.gstRate, 0) : 0;
  const collected = parseFloat(amountCollected) || 0;
  const useCollected = collected > 0 && grandSubtotal > 0;
  const manualDiscount = Math.min(parseFloat(discount)||0, grandSubtotal);
  const collectedTaxable = useCollected ? Math.floor(collected/(1+blendedRate)*100)/100 : Math.round((grandSubtotal-manualDiscount)*100)/100;
  const collectedGST = useCollected ? Math.round((collected-collectedTaxable)*100)/100 : Math.round(collectedTaxable*blendedRate*100)/100;
  const collectedDiscount = useCollected ? Math.round(Math.max(0,grandSubtotal-collectedTaxable)*100)/100 : manualDiscount;
  const netBeforeRound = useCollected ? collected : collectedTaxable+collectedGST;
  const netAmount = useCollected ? Math.round(collected) : Math.round(netBeforeRound);
  const roundOff = Math.round((netAmount-netBeforeRound)*100)/100;
  const validCart = cartWithTax.filter(i => i.name && i.price>0 && i.qty>0);

  const addLine = () => setCart(p => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);
  const updateLine = (uid, field, v) => setCart(p => p.map(i => i.uid===uid ? {...i,[field]:v} : i));
  const removeLine = (uid) => setCart(p => p.filter(i => i.uid!==uid));

  const handlePayment = async () => {
    if (validCart.length === 0) return;
    const cust = customers.find(c => c.id === selectedCustomer) || customers[0];
    const txn = { id: genId(), invoiceNo: genInvoiceNo(transactions), date: new Date().toLocaleString(), customer: cust, items: validCart, subtotal: grandSubtotal, discount: collectedDiscount, taxable: collectedTaxable, gst: collectedGST, roundOff, total: netAmount, paymentMode, settings: { ...settings } };
    await addTransaction(txn);
    setShowReceipt(txn); setCart([]); setDiscount(""); setAmountCollected("");
  };

  const handleCreateCustomer = async () => {
    setCustError(""); setCustSuccess("");
    if (!newName.trim()) { setCustError("Name is required."); return; }
    if (!newPhone.match(/^\d{10}$/)) { setCustError("Enter valid 10-digit number."); return; }
    if (customers.find(c => c.phone === newPhone)) { setCustError("Phone already registered."); return; }
    const nc = { id: genId(), name: newName.trim(), phone: newPhone };
    await saveCustomers([...customers, nc]);
    setCustSuccess("\"" + nc.name + "\" added!"); setNewName(""); setNewPhone("");
  };

  const handleDeleteTransaction = async (id) => {
    if (!isAdmin) return;
    if (window.confirm("Delete this bill?")) await deleteTransaction(id);
  };

  const handleSaveSettings = async () => {
    await saveSettings(draftSettings);
    setPaymentMode(draftSettings.defaultPaymentMode);
    alert("Settings saved!");
  };

  const handleAddProduct = async () => {
    setProdMsg("");
    if (!newProdName.trim()) { setProdMsg("Product name is required."); return; }
    if (products.find(p => p.name.toLowerCase() === newProdName.trim().toLowerCase())) { setProdMsg("Product already exists."); return; }
    await addProduct({ name: newProdName.trim(), gstOverride: newProdGst === "default" ? null : parseFloat(newProdGst) });
    setProdMsg("\"" + newProdName.trim() + "\" added!"); setNewProdName(""); setNewProdGst("default");
  };

  const grouped = {};
  transactions.forEach(txn => {
    const day = new Date(txn.date).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(txn);
  });
  const days = Object.keys(grouped).sort((a,b) => new Date(b)-new Date(a));
  const dayTotals = (txns) => ({
    gross: txns.reduce((s,t)=>s+t.subtotal,0), discount: txns.reduce((s,t)=>s+t.discount,0),
    taxable: txns.reduce((s,t)=>s+t.taxable,0), gst: txns.reduce((s,t)=>s+t.gst,0),
    net: txns.reduce((s,t)=>s+t.total,0), count: txns.length,
    cash: txns.filter(t=>t.paymentMode==="Cash").reduce((s,t)=>s+t.total,0),
    upi: txns.filter(t=>t.paymentMode==="UPI").reduce((s,t)=>s+t.total,0),
    card: txns.filter(t=>t.paymentMode==="Card").reduce((s,t)=>s+t.total,0),
    credit: txns.filter(t=>t.paymentMode==="Credit").reduce((s,t)=>s+t.total,0),
  });

  const navTabs = isAdmin
    ? [["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"],["products","📦","Products"],["settings","⚙️","Settings"]]
    : [["billing","🧾","Bill"],["customers","👤","Customers"],["history","📋","History"]];

  const syncBadge = { idle:null, syncing:["🔄 Syncing...","#f59e0b"], ok:["☁️ Saved","#16a34a"], error:["⚠️ Offline","#dc2626"] };

  if (!shopCode) return <ShopCodeScreen onEnter={handleEnterShop} />;

  if (!ready) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:12, background:"#f3f4f6" }}>
      <div style={{ fontSize:36 }}>🧵</div>
      <div style={{ fontWeight:700, fontSize:18, color:"#1e3a5f" }}>FabricBill</div>
      <div style={{ background:"#e0f2fe", borderRadius:20, padding:"4px 14px", fontSize:13, fontWeight:700, color:"#0369a1" }}>🏪 {shopCode}</div>
      <div style={{ color:"#9ca3af", fontSize:13 }}>Loading shop data...</div>
    </div>
  );

  if (!role) return <LoginScreen onLogin={r => {
    setRole(r); setTab("billing");
    try { localStorage.setItem("fabricbill_session", JSON.stringify({ role: r, expiry: Date.now() + 24*60*60*1000 })); } catch {}
  }} settings={settings} shopCode={shopCode} onChangeShop={handleChangeShop} />;

  return (
    <div style={{ fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background:"#f3f4f6", minHeight:"100vh", maxWidth:480, margin:"0 auto", paddingBottom:80 }}>
      <div style={{ background:"#1e3a5f", color:"#fff", padding:"14px 16px", position:"sticky", top:0, zIndex:50, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontWeight:800, fontSize:18 }}>{settings.shopName}</div>
          <div style={{ fontSize:10, opacity:0.6, marginTop:1 }}>🏪 {shopCode} · {new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {syncBadge[syncStatus] && <span style={{ background:syncBadge[syncStatus][1], color:"#fff", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{syncBadge[syncStatus][0]}</span>}
          <span style={{ background:isAdmin?"#fbbf24":"#34d399", color:"#1e3a5f", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:800 }}>{isAdmin?"🔐 Admin":"👤 Staff"}</span>
          <button onClick={() => { setRole(null); setTab("billing"); try { localStorage.removeItem("fabricbill_session"); } catch {} }} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"#fff", padding:"5px 10px", fontSize:11, cursor:"pointer", fontWeight:700 }}>Logout</button>
        </div>
      </div>

      <div style={{ padding:"14px 12px" }}>
        {tab === "billing" && (
          <>
            <div style={card}>
              <div style={{ display:"flex", gap:8 }}>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ ...inp, flex:1, margin:0 }}>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone?" · "+c.phone:""}</option>)}
                </select>
                <button onClick={() => setTab("customers")} style={{ padding:"10px 14px", background:"#1e3a5f", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, whiteSpace:"nowrap" }}>+ New</button>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:10, color:"#1e3a5f" }}>🧾 Items</div>
              {cart.map(item => {
                const p=parseFloat(item.price)||0, q=parseFloat(item.qty)||0;
                const rate=getGstRate(item.name,p), lineTotal=p*q*(1+rate);
                const prod=products.find(pr=>pr.name.toLowerCase()===item.name.toLowerCase());
                const hasOverride=prod&&prod.gstOverride!==null&&prod.gstOverride!==undefined;
                return (
                  <div key={item.uid} style={{ background:"#f9fafb", borderRadius:10, padding:12, marginBottom:10, border:"1px solid #e5e7eb" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <input list="prod-list" value={item.name} onChange={e=>updateLine(item.uid,"name",e.target.value)} placeholder="Item name" style={{ ...inp, flex:1, marginRight:8, padding:"8px 10px", fontSize:13 }} />
                      <button onClick={()=>removeLine(item.uid)} style={{ background:"#fee2e2", border:"none", borderRadius:6, color:"#dc2626", padding:"8px 10px", cursor:"pointer" }}>✕</button>
                      <datalist id="prod-list">{products.map(pr=><option key={pr.id||pr.name} value={pr.name}/>)}</datalist>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <div style={{ flex:1 }}><div style={{ ...lbl, fontSize:10 }}>Price (₹)</div><input type="number" min={0} value={item.price} onChange={e=>updateLine(item.uid,"price",e.target.value)} style={{ ...inp, padding:"8px 10px", fontSize:13 }} /></div>
                      <div style={{ width:110 }}>
                        <div style={{ ...lbl, fontSize:10 }}>Qty</div>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <button onClick={()=>updateLine(item.uid,"qty",Math.max(0.1,parseFloat((q-0.1).toFixed(2))))} style={{ width:30, height:38, border:"1px solid #d1d5db", background:"#fff", borderRadius:6, fontSize:16, cursor:"pointer" }}>−</button>
                          <input type="number" min={0.1} step="0.1" value={item.qty} onChange={e=>updateLine(item.uid,"qty",e.target.value)} style={{ width:50, textAlign:"center", border:"1px solid #d1d5db", borderRadius:6, padding:"8px 4px", fontSize:13 }} />
                          <button onClick={()=>updateLine(item.uid,"qty",parseFloat((q+0.1).toFixed(2)))} style={{ width:30, height:38, border:"1px solid #d1d5db", background:"#fff", borderRadius:6, fontSize:16, cursor:"pointer" }}>+</button>
                        </div>
                      </div>
                    </div>
                    {p>0&&q>0&&(
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:12 }}>
                        <span style={{ color:hasOverride?"#7c3aed":rate*100>=settings.gstHigh?"#dc2626":"#16a34a", fontWeight:600 }}>GST {(rate*100).toFixed(0)}%{hasOverride?" ★":""}</span>
                        <span style={{ fontWeight:700, color:"#1e3a5f" }}>{f(lineTotal)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {cart.length===0&&<div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:"12px 0" }}>No items added yet</div>}
              <button onClick={addLine} style={{ width:"100%", padding:"11px 0", background:"#eff6ff", color:"#1e3a5f", border:"2px dashed #93c5fd", borderRadius:8, fontSize:14, fontWeight:700, cursor:"pointer", marginTop:4 }}>+ Add Item</button>
            </div>
            {cart.length>0&&(
              <div style={card}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:12, color:"#1e3a5f" }}>💰 Summary</div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, marginBottom:8 }}><span style={{ color:"#6b7280" }}>Subtotal</span><span style={{ fontWeight:600 }}>{f(grandSubtotal)}</span></div>
                <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:12, marginBottom:10 }}>
                  <div style={{ ...lbl, color:"#92400e", marginBottom:6 }}>💵 Amount Collected</div>
                  <input type="number" min={0} value={amountCollected} onChange={e=>{setAmountCollected(e.target.value);setDiscount("");}} placeholder="Enter amount collected..." style={{ ...inp, border:"1px solid #fcd34d", fontWeight:700, fontSize:15 }} />
                </div>
                {settings.enableDiscount&&!useCollected&&(
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:14, color:"#6b7280" }}>Discount (₹)</span>
                    <input type="number" min={0} value={discount} onChange={e=>setDiscount(e.target.value)} style={{ width:90, textAlign:"right", border:"1px solid #d1d5db", borderRadius:6, padding:"6px 8px", fontSize:14 }} />
                  </div>
                )}
                <div style={{ borderTop:"1px dashed #e5e7eb", paddingTop:10, marginTop:4 }}>
                  {collectedDiscount>0&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:14, marginBottom:6, color:"#dc2626" }}><span>Discount</span><span>− {f(collectedDiscount)}</span></div>}
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, marginBottom:6, color:"#6b7280" }}><span>Gross (Taxable)</span><span>{f(collectedTaxable)}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, marginBottom:10, color:"#6b7280" }}><span>{"GST ("+(blendedRate*100).toFixed(0)+"% on "+f(collectedTaxable)+")"}</span><span>{f(collectedGST)}</span></div>
                  {roundOff!==0&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6, color:"#9ca3af" }}><span>Round Off</span><span>{(roundOff>0?"+":"")+f(roundOff)}</span></div>}
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:18, fontWeight:800, color:"#1e3a5f", borderTop:"2px solid #1e3a5f", paddingTop:10 }}><span>Net Amount</span><span>{f(netAmount)}</span></div>
                </div>
                <div style={{ marginTop:14 }}>
                  <div style={{ ...lbl, marginBottom:8 }}>Payment Mode</div>
                  <div style={{ display:"flex", gap:6 }}>
                    {PAYMENT_MODES.map(m=><button key={m} onClick={()=>setPaymentMode(m)} style={{ flex:1, padding:"9px 4px", border:"2px solid "+(paymentMode===m?"#1e3a5f":"#e5e7eb"), background:paymentMode===m?"#1e3a5f":"#fff", color:paymentMode===m?"#fff":"#555", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700 }}>{m}</button>)}
                  </div>
                </div>
                <button onClick={handlePayment} disabled={validCart.length===0} style={{ marginTop:14, width:"100%", padding:"14px 0", background:validCart.length===0?"#9ca3af":"#16a34a", color:"#fff", border:"none", borderRadius:10, fontSize:16, fontWeight:800, cursor:validCart.length===0?"not-allowed":"pointer" }}>✅ Confirm Payment</button>
              </div>
            )}
          </>
        )}

        {tab==="customers"&&(
          <>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>➕ New Customer</div>
              <div style={{ marginBottom:10 }}><label style={lbl}>Full Name</label><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Rajesh Kumar" style={inp} /></div>
              <div style={{ marginBottom:12 }}><label style={lbl}>Phone Number</label><input value={newPhone} onChange={e=>setNewPhone(e.target.value.replace(/\D/,"").slice(0,10))} placeholder="10-digit mobile" style={inp} inputMode="numeric" /></div>
              {custError&&<div style={{ color:"#dc2626", fontSize:13, marginBottom:8 }}>⚠ {custError}</div>}
              {custSuccess&&<div style={{ color:"#16a34a", fontSize:13, marginBottom:8 }}>✅ {custSuccess}</div>}
              <button onClick={handleCreateCustomer} style={{ width:"100%", padding:"12px 0", background:"#1e3a5f", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer" }}>Create Customer</button>
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>👥 All Customers ({customers.length})</div>
              {customers.map((c,i) => {
                const txns=transactions.filter(t=>t.customer.id===c.id), spent=txns.reduce((s,t)=>s+t.total,0);
                return (
                  <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i<customers.length-1?"1px solid #f3f4f6":"none" }}>
                    <div><div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div><div style={{ fontSize:12, color:"#9ca3af" }}>{c.phone||"No phone"} · {txns.length} bill{txns.length!==1?"s":""}</div></div>
                    <div style={{ textAlign:"right" }}><div style={{ fontWeight:700, color:"#1e3a5f", fontSize:14 }}>{f(spent)}</div><div style={{ fontSize:11, color:"#9ca3af" }}>total spent</div></div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab==="history"&&(
          <>
            {isAdmin&&(
              <div style={{ display:"flex", background:"#fff", borderRadius:10, padding:4, marginBottom:12, boxShadow:"0 1px 6px rgba(0,0,0,0.07)" }}>
                {[["bills","📋 Bills"],["report","📊 Day Report"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{setHistView(k);setSelectedDay(null);}} style={{ flex:1, padding:"9px 0", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", background:histView===k?"#1e3a5f":"transparent", color:histView===k?"#fff":"#9ca3af" }}>{l}</button>
                ))}
              </div>
            )}
            {(histView==="bills"||!isAdmin)&&(
              <div style={card}>
                <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>📋 Bills ({transactions.length})</div>
                {transactions.length===0?<div style={{ color:"#9ca3af", textAlign:"center", padding:"24px 0" }}>No bills yet</div>
                :transactions.map(txn=>(
                  <div key={txn.id} style={{ borderBottom:"1px solid #f3f4f6", paddingBottom:12, marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <div><div style={{ fontWeight:700, fontSize:14 }}>{txn.customer.name}</div><div style={{ fontSize:11, color:"#9ca3af" }}>{txn.invoiceNo} · {txn.date}</div></div>
                      <div style={{ textAlign:"right", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                        <div style={{ fontWeight:800, fontSize:15, color:"#16a34a" }}>{f(txn.total)}</div>
                        <div style={{ fontSize:11, color:"#9ca3af" }}>{txn.paymentMode}</div>
                        <div style={{ display:"flex", gap:4 }}>
                          <button onClick={()=>setShowReceipt(txn)} style={{ background:"#eff6ff", border:"none", borderRadius:4, color:"#2563eb", padding:"2px 8px", fontSize:10, cursor:"pointer", fontWeight:700 }}>👁 View</button>
                          {isAdmin&&<button onClick={()=>handleDeleteTransaction(txn.id)} style={{ background:"#fee2e2", border:"none", borderRadius:4, color:"#dc2626", padding:"2px 8px", fontSize:10, cursor:"pointer", fontWeight:700 }}>🗑 Delete</button>}
                        </div>
                      </div>
                    </div>
                    {txn.items.map(item=>(
                      <div key={item.uid} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#6b7280", marginTop:3 }}>
                        <span>{item.name} × {item.qty} @ {f(item.price)}</span><span>{(item.gstRate*100).toFixed(0)}% GST</span>
                      </div>
                    ))}
                    <div style={{ display:"flex", gap:12, marginTop:6, fontSize:11, color:"#9ca3af" }}><span>Discount: {f(txn.discount)}</span><span>GST: {f(txn.gst)}</span></div>
                  </div>
                ))}
              </div>
            )}
            {isAdmin&&histView==="report"&&!selectedDay&&(
              <div style={card}>
                <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>📊 Day-wise Summary</div>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <div style={{ flex:1 }}><div style={{ fontSize:10, fontWeight:700, color:"#6b7280", marginBottom:4 }}>FROM</div><input type="date" value={reportFrom} onChange={e=>setReportFrom(e.target.value)} style={{ ...inp, padding:"8px 10px", fontSize:13 }} /></div>
                  <div style={{ flex:1 }}><div style={{ fontSize:10, fontWeight:700, color:"#6b7280", marginBottom:4 }}>TO</div><input type="date" value={reportTo} onChange={e=>setReportTo(e.target.value)} style={{ ...inp, padding:"8px 10px", fontSize:13 }} /></div>
                  <button onClick={()=>{setReportFrom("");setReportTo("");}} style={{ marginTop:16, padding:"8px 10px", background:"#f3f4f6", border:"none", borderRadius:8, fontSize:11, fontWeight:700, color:"#6b7280", cursor:"pointer" }}>Clear</button>
                </div>
                {(()=>{
                  const filteredDays=days.filter(day=>{
                    const d=new Date(day);
                    if(reportFrom&&d<new Date(reportFrom))return false;
                    if(reportTo&&d>new Date(reportTo+"T23:59:59"))return false;
                    return true;
                  });
                  const allFiltered=filteredDays.flatMap(d=>grouped[d]);
                  const totals=dayTotals(allFiltered);
                  return(
                    <>
                      {(reportFrom||reportTo)&&allFiltered.length>0&&(
                        <div style={{ background:"#eff6ff", borderRadius:10, padding:12, marginBottom:12 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:"#1e3a5f", marginBottom:8 }}>Summary for selected range</div>
                          {[["Gross Total",f(totals.gross)],["Less Discount",f(totals.discount)],["Taxable Value",f(totals.taxable)],["GST Collected",f(totals.gst)],["Net Collection",f(totals.net)]].map(([l,v])=>(
                            <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"4px 0", borderBottom:"1px solid #dbeafe" }}>
                              <span style={{ color:"#374151" }}>{l}</span><span style={{ fontWeight:l==="Net Collection"?800:600, color:l==="Net Collection"?"#1e3a5f":"#111" }}>{v}</span>
                            </div>
                          ))}
                          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
                            {[["Cash",totals.cash,"#16a34a"],["UPI",totals.upi,"#2563eb"],["Card",totals.card,"#7c3aed"],["Credit",totals.credit,"#dc2626"]].map(([m,v,c])=>v>0&&<span key={m} style={{ fontSize:10, background:"#fff", borderRadius:4, padding:"2px 8px", color:c, fontWeight:700 }}>{m}: {f(v)}</span>)}
                          </div>
                        </div>
                      )}
                      {filteredDays.length===0?<div style={{ color:"#9ca3af", textAlign:"center", padding:"24px 0" }}>No transactions found</div>
                      :filteredDays.map((day,i)=>{
                        const t=dayTotals(grouped[day]);
                        return(
                          <div key={day} onClick={()=>setSelectedDay(day)} style={{ borderBottom:i<filteredDays.length-1?"1px solid #f3f4f6":"none", padding:"12px 0", cursor:"pointer" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                              <div><div style={{ fontWeight:700, fontSize:14 }}>{day}</div><div style={{ fontSize:11, color:"#9ca3af" }}>{t.count} bill{t.count!==1?"s":""}</div></div>
                              <div style={{ textAlign:"right" }}><div style={{ fontWeight:800, fontSize:15, color:"#1e3a5f" }}>{f(t.net)}</div><div style={{ fontSize:11, color:"#9ca3af" }}>Net Collection</div></div>
                            </div>
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                              {[["Cash",t.cash,"#16a34a"],["UPI",t.upi,"#2563eb"],["Card",t.card,"#7c3aed"],["Credit",t.credit,"#dc2626"]].map(([m,v,c])=>v>0&&<span key={m} style={{ fontSize:10, background:"#f3f4f6", borderRadius:4, padding:"2px 6px", color:c, fontWeight:700 }}>{m}: {f(v)}</span>)}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            )}
            {isAdmin&&histView==="report"&&selectedDay&&(()=>{
              const t=dayTotals(grouped[selectedDay]);
              return(
                <div>
                  <button onClick={()=>setSelectedDay(null)} style={{ background:"#eff6ff", border:"none", borderRadius:8, padding:"8px 14px", color:"#1e3a5f", fontWeight:700, fontSize:13, cursor:"pointer", marginBottom:12 }}>← Back</button>
                  <div style={card}>
                    <div style={{ fontWeight:800, fontSize:16, color:"#1e3a5f", marginBottom:2 }}>{selectedDay}</div>
                    <div style={{ fontSize:12, color:"#9ca3af", marginBottom:14 }}>{t.count} bills</div>
                    {[["Gross Total",f(t.gross)],["Less Discount",f(t.discount)],["Taxable Value",f(t.taxable)],["GST Collected",f(t.gst)],["Net Collection",f(t.net)]].map(([l,v])=>(
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:14, padding:"7px 0", borderBottom:"1px solid #f3f4f6" }}>
                        <span style={{ color:"#6b7280" }}>{l}</span><span style={{ fontWeight:l==="Net Collection"?800:600, color:l==="Net Collection"?"#1e3a5f":"#111", fontSize:l==="Net Collection"?16:14 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop:14, fontWeight:700, fontSize:13, color:"#1e3a5f", marginBottom:8 }}>Payment Mode Breakup</div>
                    {[["Cash",t.cash],["UPI",t.upi],["Card",t.card],["Credit",t.credit]].map(([m,v])=>(
                      <div key={m} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:"1px solid #f3f4f6" }}><span style={{ color:"#6b7280" }}>{m}</span><span style={{ fontWeight:600 }}>{f(v)}</span></div>
                    ))}
                  </div>
                  <div style={card}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#1e3a5f", marginBottom:12 }}>Bills on this day</div>
                    {grouped[selectedDay].map(txn=>(
                      <div key={txn.id} style={{ borderBottom:"1px solid #f3f4f6", paddingBottom:10, marginBottom:10, display:"flex", justifyContent:"space-between" }}>
                        <div><div style={{ fontWeight:700, fontSize:13 }}>{txn.customer.name}</div><div style={{ fontSize:11, color:"#9ca3af" }}>{txn.invoiceNo} · {txn.paymentMode}</div></div>
                        <div style={{ fontWeight:800, color:"#16a34a", fontSize:14 }}>{f(txn.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {tab==="products"&&isAdmin&&(
          <>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:4 }}>➕ Add Product</div>
              <div style={{ fontSize:12, color:"#9ca3af", marginBottom:12 }}>★ = Fixed GST override · Default = threshold-based GST</div>
              <div style={{ marginBottom:10 }}><label style={lbl}>Product Name</label><input value={newProdName} onChange={e=>setNewProdName(e.target.value)} placeholder="e.g. Silk Carpet" style={inp} /></div>
              <div style={{ marginBottom:12 }}><label style={lbl}>GST Rate</label><GstSelect value={newProdGst} onChange={setNewProdGst} /></div>
              {prodMsg&&<div style={{ fontSize:13, marginBottom:8, color:prodMsg.includes("added")?"#16a34a":"#dc2626" }}>{prodMsg.includes("added")?"✅ ":"⚠ "}{prodMsg}</div>}
              <button onClick={handleAddProduct} style={{ width:"100%", padding:"12px 0", background:"#1e3a5f", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer" }}>Add Product</button>
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>📦 Product Master ({products.length})</div>
              {products.length===0&&<div style={{ color:"#9ca3af", fontSize:13, textAlign:"center", padding:"16px 0" }}>No products yet.</div>}
              {products.map((p,i)=>(
                <div key={p.id||p.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0", borderBottom:i<products.length-1?"1px solid #f3f4f6":"none" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:p.gstOverride!==null&&p.gstOverride!==undefined?"#7c3aed":"#9ca3af" }}>
                      {p.gstOverride!==null&&p.gstOverride!==undefined?"★ Fixed: "+p.gstOverride+"%":"Default (threshold-based)"}
                    </div>
                  </div>
                  <GstSelect value={p.gstOverride} onChange={v=>updateProduct({...p,gstOverride:v==="default"?null:parseFloat(v)})} />
                  <button onClick={()=>{if(window.confirm("Delete \""+p.name+"\"?"))removeProduct(p.id);}} style={{ background:"#fee2e2", border:"none", borderRadius:6, color:"#dc2626", padding:"8px 10px", cursor:"pointer" }}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="settings"&&isAdmin&&(
          <>
            <div style={{ background:"#fef3c7", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#92400e" }}>
              🏪 Shop Code: <b>{shopCode}</b> — Share this with your staff.
              <button onClick={handleChangeShop} style={{ marginLeft:10, background:"none", border:"1px solid #92400e", borderRadius:6, color:"#92400e", padding:"2px 8px", fontSize:11, cursor:"pointer", fontWeight:700 }}>Switch Shop</button>
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>🏪 Shop Info</div>
              {[["shopName","Shop Name"],["shopTagline","Tagline / Description"],["shopAddress","Address"],["shopPhone","Phone"],["gstin","GSTIN"],["stateCode","State Code"]].map(([k,l])=>(
                <div key={k} style={{ marginBottom:10 }}><label style={lbl}>{l}</label><input value={draftSettings[k]||""} onChange={e=>setDraftSettings(p=>({...p,[k]:e.target.value}))} style={inp} /></div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>🧾 Invoice Footer</div>
              {[["footerNote","Footer Note"],["signoff","Sign-off Text"]].map(([k,l])=>(
                <div key={k} style={{ marginBottom:10 }}><label style={lbl}>{l}</label><input value={draftSettings[k]||""} onChange={e=>setDraftSettings(p=>({...p,[k]:e.target.value}))} style={inp} /></div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>🧾 GST Config</div>
              {[["gstLow","GST Rate Below Threshold (%)"],["gstHigh","GST Rate Above Threshold (%)"],["gstThreshold","Threshold Amount (₹)"]].map(([k,l])=>(
                <div key={k} style={{ marginBottom:10 }}><label style={lbl}>{l}</label><input type="number" value={draftSettings[k]} onChange={e=>setDraftSettings(p=>({...p,[k]:parseFloat(e.target.value)||0}))} style={inp} /></div>
              ))}
              <div style={{ background:"#eff6ff", borderRadius:7, padding:"8px 12px", fontSize:12, color:"#1e40af" }}>Below {settings.currency}{draftSettings.gstThreshold}: {draftSettings.gstLow}% · Above: {draftSettings.gstHigh}%</div>
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>⚙️ Billing Options</div>
              <div style={{ marginBottom:10 }}><label style={lbl}>Currency Symbol</label><input value={draftSettings.currency} onChange={e=>setDraftSettings(p=>({...p,currency:e.target.value}))} style={{ ...inp, width:80 }} /></div>
              <div style={{ marginBottom:12 }}><label style={lbl}>Default Payment Mode</label>
                <select value={draftSettings.defaultPaymentMode} onChange={e=>setDraftSettings(p=>({...p,defaultPaymentMode:e.target.value}))} style={inp}>
                  {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="disc" checked={draftSettings.enableDiscount} onChange={e=>setDraftSettings(p=>({...p,enableDiscount:e.target.checked}))} style={{ width:18, height:18 }} />
                <label htmlFor="disc" style={{ fontSize:14, fontWeight:600 }}>Enable Discount Field</label>
              </div>
            </div>
            <div style={card}>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e3a5f", marginBottom:12 }}>🔐 PIN Management</div>
              {[["adminPin","Admin PIN"],["staffPin","Staff PIN"]].map(([k,l])=>(
                <div key={k} style={{ marginBottom:10 }}>
                  <label style={lbl}>{l}</label>
                  <input type="password" maxLength={4} value={draftSettings[k]||""} onChange={e=>setDraftSettings(p=>({...p,[k]:e.target.value.replace(/\D/,"").slice(0,4)}))} placeholder="4-digit PIN" style={{ ...inp, width:120, letterSpacing:8, fontSize:18 }} inputMode="numeric" />
                </div>
              ))}
            </div>
            <button onClick={handleSaveSettings} style={{ width:"100%", padding:"14px 0", background:"#1e3a5f", color:"#fff", border:"none", borderRadius:10, fontSize:16, fontWeight:800, cursor:"pointer", marginBottom:12 }}>💾 Save Settings</button>
          </>
        )}
      </div>

      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"#fff", borderTop:"1px solid #e5e7eb", display:"flex", zIndex:50 }}>
        {navTabs.map(([key,icon,l])=>(
          <button key={key} onClick={()=>setTab(key)} style={{ flex:1, padding:"10px 0", border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, color:tab===key?"#1e3a5f":"#9ca3af" }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span style={{ fontSize:9, fontWeight:tab===key?800:500 }}>{l}</span>
          </button>
        ))}
      </div>

      {showReceipt&&<InvoiceView txn={showReceipt} settings={settings} onClose={()=>{setShowReceipt(null);setTab("billing");}} />}
    </div>
  );
}
