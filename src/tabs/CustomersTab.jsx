// ─────────────────────────────────────────────
// tabs/CustomersTab.jsx
// ─────────────────────────────────────────────
import { useState } from "react";
import { upsertCustomer } from "../lib/api";
import { fmt } from "../utils/format";
import { genId } from "../utils/misc";
import { card, inp, lbl } from "../styles";

export function CustomersTab({
  customers, setCustomers,
  transactions, settlements,
  getCustomerOutstanding,
  settings, shopCode,
  onSettle, onViewLedger,
}) {
  const [newName, setNewName]         = useState("");
  const [newPhone, setNewPhone]       = useState("");
  const [custError, setCustError]     = useState("");
  const [custSuccess, setCustSuccess] = useState("");
  const f = (n) => fmt(n, settings.currency);

  const handleCreate = async () => {
    setCustError(""); setCustSuccess("");
    if (!newName.trim()) return setCustError("Name required.");
    if (!newPhone.match(/^\d{10}$/)) return setCustError("Enter valid 10-digit number.");
    if (customers.find((c) => c.phone === newPhone)) return setCustError("Phone already registered.");
    const nc = { id: genId(), name: newName.trim(), phone: newPhone };
    await upsertCustomer(shopCode, nc);
    setCustomers((p) => [...p, nc]);
    setCustSuccess(`"${nc.name}" added!`);
    setNewName(""); setNewPhone("");
  };

  return (
    <>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>➕ New Customer</div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Full Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Rajesh Kumar" style={inp} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Phone Number</label>
          <input value={newPhone}
            onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile" inputMode="numeric" style={inp} />
        </div>
        {custError   && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ {custError}</div>}
        {custSuccess && <div style={{ color: "#16a34a", fontSize: 13, marginBottom: 8, background: "#f0fdf4", padding: "6px 10px", borderRadius: 6 }}>✅ {custSuccess}</div>}
        <button onClick={handleCreate}
          style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Create Customer
        </button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>👥 All Customers ({customers.length})</div>
        {customers.map((c, i) => {
          const txns        = transactions.filter((t) => t.customer?.id === c.id || t.customerId === c.id);
          const spent       = txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.total || 0), 0);
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
                      <button onClick={() => onSettle(c)}
                        style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        💳 Settle
                      </button>
                    )}
                    <button onClick={() => onViewLedger(c)}
                      style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      📒 Ledger
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
