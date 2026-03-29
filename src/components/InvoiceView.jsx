// ─────────────────────────────────────────────
// src/components/InvoiceView.jsx
// Full invoice modal with:
//   - Print (browser)
//   - WhatsApp (AiSensy API with PDF)
//   - PDF download/share
//   - Thermal print (actual print command)
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
    if (!phone || phone.length !== 10) {
      alert("No valid phone number for this customer.");
      return;
    }
    setSending(true);
    try {
      const base64    = await generatePDFBase64();
      const filename  = `Invoice-${txn.invoiceNo.replace("/", "-")}.pdf`;
      const pdfUrl = await uploadPDF(base64, filename);
      await sendWhatsApp(
        phone,
        "invoice_sent",
        [
          txn.customer?.name || txn.customerName || "Customer",
          settings.shopName,
          txn.invoiceNo,
          fmtDate(txn.date),
          fmt(total, settings.currency),
          txn.payments?.[0]?.mode || txn.paymentMode || "Cash",
          settings.footerNote || "Thank you for your business!",
        ],
        pdfUrl,
        filename,
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
    // W = 32 chars for 58mm paper
    // Adjust down to 24 if text still wraps on your printer
    const W    = 32;
    const line = "-".repeat(W);
    const dline = "=".repeat(W);

    // Wrap a long string at word boundaries
    const wrap = (s, w) => {
      if (!s) return "";
      const words = s.split(" ");
      const lines = [];
      let cur = "";
      words.forEach((word) => {
        if ((cur + " " + word).trim().length <= w) {
          cur = (cur + " " + word).trim();
        } else {
          if (cur) lines.push(cur);
          cur = word.slice(0, w);
        }
      });
      if (cur) lines.push(cur);
      return lines.join("\n");
    };

    // Centre within W
    const ctr = (s) => {
      if (!s) return "";
      // wrap first then centre each line
      return wrap(s, W).split("\n").map((l) =>
        " ".repeat(Math.max(0, Math.floor((W - l.length) / 2))) + l
      ).join("\n");
    };

    // Left label, right value — both fit on one line
    const row = (l, r) => {
      l = String(l); r = String(r);
      const maxL = W - r.length - 1;
      if (l.length > maxL) l = l.slice(0, maxL);
      return l + " ".repeat(Math.max(1, W - l.length - r.length)) + r;
    };

    // Short date: "27-Mar-26" instead of "27 Mar 2026"
    const shortDate = (d) => {
      try {
        const dt = new Date(d);
        const day = String(dt.getDate()).padStart(2, "0");
        const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
        const yr  = String(dt.getFullYear()).slice(2);
        return day + "-" + mon + "-" + yr;
      } catch { return ""; }
    };

    let t = "";

    // ── Header ──
    t += ctr(settings.shopName) + "\n";
    if (settings.shopTagline) t += ctr(settings.shopTagline) + "\n";
    if (settings.shopAddress)  t += wrap(settings.shopAddress, W) + "\n";
    if (settings.shopPhone)    t += "Ph: " + settings.shopPhone + "\n";
    if (settings.gstin)        t += "GSTIN: " + settings.gstin + "\n";
    t += line + "\n";

    // ── Void banner ──
    if (isVoid) t += ctr("** VOID **") + "\n" + line + "\n";

    // ── Invoice meta — keep each value short ──
    t += row("Invoice:", txn.invoiceNo) + "\n";
    t += row("Date:", shortDate(txn.date)) + "\n";
    const buyerName = (txn.customer?.name || txn.customerName || "").slice(0, W - 7);
    t += row("Buyer:", buyerName) + "\n";
    const phone = txn.customer?.phone || txn.customerPhone;
    if (phone) t += row("Ph:", phone) + "\n";
    t += line + "\n";

    // ── Items ──
    txn.items.forEach((item, idx) => {
      const name   = (item.name || "").slice(0, W - 3);
      const qty    = parseFloat(item.qty)   || 0;
      const price  = parseFloat(item.price) || 0;
      const amount = (qty * price).toFixed(2);
      // Line 1: number + name
      t += (idx + 1) + ". " + name + "\n";
      // Line 2: qty x rate (right-aligned amount)
      t += row("   " + qty + " x " + price.toFixed(2), amount) + "\n";
    });
    t += line + "\n";

    // ── Totals ──
    const displayDiscount = Math.round((txn.subtotal - txn.taxable) * 100) / 100;
    if (displayDiscount > 0.01) t += row("Discount", "-" + displayDiscount.toFixed(2)) + "\n";
    t += row("Taxable", txn.taxable.toFixed(2)) + "\n";
    gstRows.forEach((r) => {
      t += row("CGST@" + r.half + "%", r.cgst.toFixed(2)) + "\n";
      t += row("SGST@" + r.half + "%", r.sgst.toFixed(2)) + "\n";
    });
    if (txn.roundOff && txn.roundOff !== 0) {
      t += row("Round Off", (txn.roundOff > 0 ? "+" : "") + txn.roundOff.toFixed(2)) + "\n";
    }
    t += dline + "\n";
    t += row("NET AMOUNT", fmt(total, "")) + "\n";
    t += dline + "\n";

    // ── Payment ──
    if (hasSplit) {
      t += "Payment:\n";
      txn.payments.filter((p) => p.amount > 0).forEach((p) => {
        t += row("  " + p.mode, fmt(p.amount, "")) + "\n";
      });
    } else {
      t += row("Payment:", paymentLabel) + "\n";
    }
    if (creditAmt > 0) t += row("AMT DUE:", fmt(creditAmt, "")) + "\n";
    t += line + "\n";

    // ── Amount in words — word-wrapped ──
    const wrapLine = (str, w) => {
      const out = [];
      while (str.length > w) {
        let cut = str.lastIndexOf(" ", w);
        if (cut <= 0) cut = w;
        out.push(str.slice(0, cut));
        str = str.slice(cut + 1);
      }
      if (str) out.push(str);
      return out.join("\n");
    };
    t += wrapLine("Amt: " + amtWords, W) + "\n";
    t += line + "\n";

    // ── Footer — word-wrapped ──
    if (settings.footerNote) t += wrap(settings.footerNote, W) + "\n";
    if (settings.signoff)    t += ctr(settings.signoff) + "\n";
    t += "\n\n\n";

    return t;
  };

  const doThermalPrint = () => {
    const thermalText = buildThermal();

    // If running inside the FabricBill APK on TVS i9100,
    // use the native printer bridge directly — no dialog, instant print.
    if (window.printToTVS && window.isTVSPrinterAvailable && window.isTVSPrinterAvailable()) {
      const success = window.printToTVS(thermalText);
      if (success) return;
    }

    // Hidden iframe print — works on i9100
    const existing = document.getElementById("thermal-print-frame");
    if (existing) existing.remove();

    const iframe = document.createElement("iframe");
    iframe.id    = "thermal-print-frame";
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:58mm;height:1px;border:none;";
    document.body.appendChild(iframe);

    const escaped = thermalText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    const html = `<!DOCTYPE html><html><head>
      <style>
        @page { margin:0; size:58mm auto; }
        body {
          font-family:'Courier New',Courier,monospace;
          font-size:9px; line-height:1.35;
          margin:0; padding:1mm 2mm;
          width:56mm; color:#000; background:#fff;
          white-space:pre; word-break:normal;
        }
      </style>
    </head><body>${escaped}</body></html>`;

    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    iframe.contentWindow.focus();
    iframe.contentWindow.print();

    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 3000);
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
                {(txn.subtotal - txn.taxable) > 0.01 && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px", fontSize: 10 }}>
                    <span>Less Discount</span>
                    <span style={{ fontWeight: 600 }}>{f(Math.round((txn.subtotal - txn.taxable) * 100) / 100)}</span>
                  </div>
                )}
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
            ["🖨️", "Thermal", "#2563eb", doThermalPrint],
            ["✖",  "Close",   "#1e3a5f", onClose],
          ].map(([icon, label, bg, fn]) => (
            <button key={label} onClick={fn} disabled={sending}
              style={{ padding: "11px 0", background: bg, color: "#fff", border: "none", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: sending ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: sending ? 0.7 : 1 }}>
              <span style={{ fontSize: 16 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Thermal modal (kept as fallback for copy) */}
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
