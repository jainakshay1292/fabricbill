// ─────────────────────────────────────────────
// src/components/InvoiceView.jsx
// Full invoice modal with:
//   - Print (browser)
//   - WhatsApp (AiSensy API with PDF)
//   - PDF download/share
//   - Thermal print text
// ─────────────────────────────────────────────

import { useState, Fragment } from "react";
import { fmt, fmtDate, numToWords } from "../utils/format";
import { buildGstRows } from "../utils/gst";
import { BDR, tds } from "../styles";
import { uploadPDF, sendWhatsApp } from "../lib/api";

export default function InvoiceView({ txn, settings, onClose }) {
  const [showThermal, setShowThermal] = useState(false);
  const [sending, setSending]         = useState(false);
  const f = (n) => fmt(n, settings.currency);

  // ── Derived values ────────────────────────────────────────
  const amtWords  = numToWords(Math.round(txn.total || txn.net || 0)) + " Rupees Only";
  const total     = txn.total || txn.net || 0;
  const subtotal  = txn.subtotal ||
    txn.items?.reduce((s, i) => s + (parseFloat(i.price) || 0) * Math.abs(parseFloat(i.qty) || 0), 0) || 0;
  const gstRows   = buildGstRows(txn.items || [], txn.taxable || 0, subtotal);
  const hasSplit  = txn.payments && txn.payments.length > 1;
  const creditAmt = txn.payments
    ? (txn.payments.find((p) => p.mode === "Credit") || {}).amount || 0
    : txn.paymentMode === "Credit" ? total : 0;
  const paymentLabel = hasSplit
    ? txn.payments.filter((p) => p.amount > 0).map((p) => p.mode + ": " + f(p.amount)).join(" | ")
    : txn.payments?.[0]?.mode || txn.paymentMode || "Cash";
  const isVoid = txn.void || txn.cancelled;

  // ── Load jsPDF + html2canvas dynamically ─────────────────
  const loadPDFLibs = async () => {
    if (!window.html2canvas)
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    if (!window.jspdf)
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
  };

  // ── Generate PDF blob ─────────────────────────────────────
  const generatePDFBase64 = async () => {
    await loadPDFLibs();
    const el = document.getElementById("inv-print");
    const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pdfW = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pdfW, (canvas.height * pdfW) / canvas.width);
    // Return as base64 string
    return pdf.output("datauristring").split(",")[1];
  };

  // ── Print (browser print dialog) ─────────────────────────
  const doPrint = () => {
    const el  = document.getElementById("inv-print");
    const win = window.open("", "_blank");
    if (!win || !el) return;
    win.document.write(`<html><head><title>Invoice ${txn.invoiceNo}</title>
      <style>body{font-family:monospace;margin:20px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;}</style>
      </head><body>${el.innerHTML}
      <br/><button onclick="window.print();window.close();">Print / Save PDF</button>
      </body></html>`);
    win.document.close();
  };

  // ── WhatsApp via AiSensy (PDF) ────────────────────────────
  const doWhatsApp = async () => {
    const phone = txn.customer?.phone || txn.customerPhone || "";

    // Fallback if no phone
    if (!phone || phone.length !== 10) {
      alert("No valid phone number for this customer.");
      return;
    }

    setSending(true);
    try {
      // 1. Generate PDF as base64
      const base64    = await generatePDFBase64();
      const filename  = `Invoice-${txn.invoiceNo.replace("/", "-")}.pdf`;

      // 2. Upload PDF to Vercel Blob → get public URL
      const pdfUrl = await uploadPDF(base64, filename);

      // 3. Send via AiSensy with PDF URL
      await sendWhatsApp(
        phone,
        "invoice_sent",
        [
          txn.customer?.name || txn.customerName || "Customer",  // {{1}}
          settings.shopName,                                      // {{2}}
          txn.invoiceNo,                                          // {{3}}
          fmtDate(txn.date),                                      // {{4}}
          fmt(total, settings.currency),                          // {{5}}
          txn.payments?.[0]?.mode || txn.paymentMode || "Cash",  // {{6}}
          settings.footerNote || "Thank you for your business!", // {{7}}
        ],
        pdfUrl,    // PDF URL for AiSensy
        filename,  // filename shown in WhatsApp
      );

      alert("✅ Invoice sent on WhatsApp with PDF!");
    } catch (e) {
      console.error("WhatsApp error:", e.message);
      alert("❌ Could not send WhatsApp: " + e.message);
    } finally {
      setSending(false);
    }
  };

  // ── PDF download/share ────────────────────────────────────
  const doSharePDF = async () => {
    setSending(true);
    try {
      const base64   = await generatePDFBase64();
      const filename = `Invoice-${txn.invoiceNo.replace("/", "-")}.pdf`;
      // Convert base64 to blob for download
      const byteChars   = atob(base64);
      const byteNumbers = new Array(byteChars.length).fill(0).map((_, i) => byteChars.charCodeAt(i));
      const byteArray   = new Uint8Array(byteNumbers);
      const blob        = new Blob([byteArray], { type: "application/pdf" });
      const file        = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "Invoice " + txn.invoiceNo, files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      alert("Could not generate PDF. Try on mobile Chrome.");
    } finally {
      setSending(false);
    }
  };

  // ── Thermal text ──────────────────────────────────────────
  const buildThermal = () => {
    const W = 32, line = "-".repeat(W);
    const ctr = (s) => " ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
    const row = (l, r) => l + " ".repeat(Math.max(1, W - l.length - r.length)) + r;
    let t = ctr(settings.shopName) + "\n" + ctr(settings.shopAddress || "") + "\nGSTIN: " + settings.gstin + "\n" + line + "\n";
    if (isVoid) t += "*** VOID / CANCELLED ***\n" + line + "\n";
    t += `Invoice: ${txn.invoiceNo}\nDate: ${fmtDate(txn.date)}\nBuyer: ${txn.customer?.name || txn.customerName}\n` + line + "\n";
    txn.items.forEach((item) => {
      t += row(item.name + " (" + item.qty + "x" + (item.price || 0).toFixed(2) + ")", ((item.price || 0) * (item.qty || 0)).toFixed(2)) + "\n";
    });
    t += line + "\n";
    if (txn.discount > 0) t += row("Discount", "-" + fmt(txn.discount, "")) + "\n";
    t += row("Taxable", fmt(txn.taxable, "")) + "\n";
    gstRows.forEach((r) => {
      t += row("CGST " + r.half + "%", fmt(r.cgst, "")) + "\n" + row("SGST " + r.half + "%", fmt(r.sgst, "")) + "\n";
    });
    t += line + "\n" + row("NET", fmt(total, "")) + "\n" + line + "\nPayment: " + paymentLabel + "\n";
    if (creditAmt > 0) t += "AMOUNT DUE: " + fmt(creditAmt, "") + "\n";
    t += "\nAmt: " + amtWords + "\n" + line + "\n" + ctr(settings.footerNote || "") + "\n" + ctr(settings.signoff || "") + "\n\n\n";
    return t;
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Void banner */}
        {isVoid && (
          <div style={{ background: "#fee2e2", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontWeight: 800, color: "#dc2626", fontSize: 15, textAlign: "center" }}>
            ❌ VOID / CANCELLED INVOICE
          </div>
        )}

        {/* Printable invoice area */}
        <div id="inv-print" style={{ border: "2px solid #000", padding: 10, fontFamily: "monospace", fontSize: 11, opacity: isVoid ? 0.55 : 1 }}>
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: BDR, paddingBottom: 6, marginBottom: 6 }}>
            {isVoid && <div style={{ fontWeight: 900, fontSize: 14, color: "#dc2626", marginBottom: 4 }}>*** VOID / CANCELLED ***</div>}
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

          {/* Invoice meta */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span><b>Invoice No:</b> {txn.invoiceNo}</span>
            <span><b>Date:</b> {fmtDate(txn.date)}</span>
          </div>
          <div style={{ marginBottom: 4 }}><b>Buyer:</b> {txn.customer?.name || txn.customerName}</div>
          {(txn.customer?.phone || txn.customerPhone) && <div style={{ marginBottom: 2 }}><b>Ph:</b> {txn.customer?.phone || txn.customerPhone}</div>}
          <div style={{ marginBottom: 6 }}><b>Address:</b> ............................................</div>

          {/* Items table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                {["Sl.", "Particulars", "HSN", "Qty", "Rate", "Amount"].map((h, i) => (
                  <th key={h} style={tds({ textAlign: i >= 3 ? "right" : i === 0 ? "center" : "left", fontWeight: 700 })}>{h}</th>
                ))}
              </tr>
            </thead>
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
                <tr key={"e" + i}>{[0,1,2,3,4,5].map((c) => <td key={c} style={tds({ height: 20 })}>&nbsp;</td>)}</tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
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
                {gstRows.map((r) => (
                  <Fragment key={r.rate}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>CGST @ {r.half}%</span><span style={{ fontWeight: 600 }}>{f(r.cgst)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>SGST @ {r.half}%</span><span style={{ fontWeight: 600 }}>{f(r.sgst)}</span></div>
                  </Fragment>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}><span>IGST @</span><span style={{ fontWeight: 600 }}>—</span></div>
                {!!(txn.roundOff && txn.roundOff !== 0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}>
                    <span>Round Off</span><span>{(txn.roundOff > 0 ? "+" : "") + f(txn.roundOff)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", fontWeight: 900, fontSize: 12 }}><span>Net Value</span><span>{f(Math.round(total))}</span></div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, paddingTop: 6, fontSize: 9 }}>
            <span>{settings.footerNote}</span>
            <span style={{ textAlign: "right" }}>
              <div style={{ marginBottom: 28 }}><b>{settings.signoff}</b></div>
              <div>Authorised Signatory</div>
            </span>
          </div>
          <div style={{ borderTop: BDR, marginTop: 4, paddingTop: 4, fontSize: 9, textAlign: "center" }}>
            Certified that details given above are true and correct.
          </div>
        </div>

        {/* Credit due banner */}
        {creditAmt > 0 && !isVoid && (
          <div style={{ background: "#fee2e2", border: "2px solid #dc2626", borderRadius: 10, padding: "12px 14px", marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#dc2626" }}>⚠ Amount Due (Credit)</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{txn.customer?.name || txn.customerName}</div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#dc2626" }}>{f(creditAmt)}</div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginTop: 14 }}>
          {[
            ["🖨️", "Print",   "#16a34a", doPrint],
            ["💬", sending ? "…" : "WA", "#25d366", doWhatsApp],
            ["📄", "PDF",     "#128c7e", doSharePDF],
            ["🖨️", "Thermal", "#2563eb", () => setShowThermal(true)],
            ["✖",  "Close",   "#1e3a5f", onClose],
          ].map(([icon, label, bg, fn]) => (
            <button key={label} onClick={fn} disabled={sending}
              style={{ padding: "11px 0", background: bg, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: sending ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: sending ? 0.7 : 1 }}>
              <span style={{ fontSize: 16 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Thermal modal */}
        {showThermal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowThermal(false); }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 16, width: "100%", maxWidth: 480, margin: "0 auto" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 8 }}>📲 Thermal Print</div>
              <pre style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 11, overflowX: "auto", marginBottom: 12, maxHeight: 280, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                {buildThermal()}
              </pre>
              <button onClick={() => navigator.clipboard.writeText(buildThermal()).then(() => alert("Copied!"))}
                style={{ width: "100%", padding: "12px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>
                📋 Copy to Clipboard
              </button>
              <button onClick={() => setShowThermal(false)}
                style={{ width: "100%", padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
