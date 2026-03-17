// ─────────────────────────────────────────────
// components/ReceiptVoucher.jsx
// ─────────────────────────────────────────────
import { fmt, fmtDate } from "../utils/format";
import { BDR } from "../styles";

export function ReceiptVoucher({ voucher, settings, onClose }) {
  const f = (n) => fmt(n, settings.currency);

  const doWhatsApp = () => {
    const msg = `🧵 *${settings.shopName}*\n─────────────────────\n📄 *RECEIPT VOUCHER: ${voucher.voucherNo}*\n📅 Date: ${fmtDate(voucher.date)}\n👤 Customer: *${voucher.customerName}*\n─────────────────────\n💰 Amount Received: *${f(voucher.amount)}*\n💳 Mode: ${voucher.paymentMode}\n📋 Previous Outstanding: ${f(voucher.prevOutstanding)}\n✅ Remaining Outstanding: ${f(voucher.remainingOutstanding)}\n─────────────────────\n*${settings.signoff}*`;
    const phone = voucher.customerPhone || "";
    window.open((phone ? `https://wa.me/91${phone}` : "https://wa.me/") + "?text=" + encodeURIComponent(msg), "_blank");
  };

  const doPrint = () => {
    const el  = document.getElementById("rv-print");
    const win = window.open("", "_blank");
    if (!win || !el) return;
    win.document.write(`<html><head><title>Receipt ${voucher.voucherNo}</title><style>body{font-family:monospace;margin:20px;}</style></head><body>${el.innerHTML}<br/><button onclick="window.print();window.close();">Print</button></body></html>`);
    win.document.close();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
            {[
              ["Amount Received",      f(voucher.amount),           true],
              ["Payment Mode",         voucher.paymentMode,         false],
              ["Previous Outstanding", f(voucher.prevOutstanding),  false],
            ].map(([l, v, bold]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>{l}</span><span style={{ fontWeight: bold ? 800 : 400 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
              <span>Remaining Outstanding</span>
              <span style={{ color: voucher.remainingOutstanding > 0 ? "#dc2626" : "#16a34a" }}>{f(voucher.remainingOutstanding)}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 8 }}>
            <span>{settings.footerNote}</span>
            <span style={{ textAlign: "right" }}>
              <div style={{ marginBottom: 20 }}><b>{settings.signoff}</b></div>
              <div>Authorised Signatory</div>
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 14 }}>
          {[["🖨️","Print","#16a34a",doPrint],["💬","WA","#25d366",doWhatsApp],["✖","Close","#1e3a5f",onClose]].map(([icon,label,bg,fn]) => (
            <button key={label} onClick={fn}
              style={{ padding: "11px 0", background: bg, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 16 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
