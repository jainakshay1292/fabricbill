// ─────────────────────────────────────────────
// tabs/CustomersTab.jsx
// Search-first approach:
//   1. User types name or phone to search
//   2. If not found → show inline Add form
//   3. Full list shown below search
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
  const [search, setSearch]           = useState("");
  const [newName, setNewName]         = useState("");
  const [newPhone, setNewPhone]       = useState("");
  const [custError, setCustError]     = useState("");
  const [custSuccess, setCustSuccess] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const f = (n) => fmt(n, settings.currency);

  // ── Sort alphabetically, walk-in always first ─
  const sorted = [...customers].sort((a, b) => {
    if (a.id === "c1") return -1;
    if (b.id === "c1") return 1;
    return a.name.localeCompare(b.name);
  });

  // ── Filter by name or phone ───────────────────
  const q = search.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").includes(q)
      )
    : sorted;

  const noResults = q && filtered.length === 0;

  // ── Pre-fill phone if search looks like a number
  const handleSearchChange = (val) => {
    setSearch(val);
    setCustError("");
    setCustSuccess("");
    setShowAddForm(false);
    // Auto-fill phone field if search is numeric
    if (/^\d+$/.test(val)) setNewPhone(val.slice(0, 10));
    else setNewPhone("");
    setNewName("");
  };

  const handleCreate = async () => {
    setCustError(""); setCustSuccess("");
    if (!newName.trim()) return setCustError("Name required.");
    if (newPhone && !newPhone.match(/^\d{10}$/)) return setCustError("Enter valid 10-digit number.");
    if (newPhone && customers.find((c) => c.phone === newPhone)) return setCustError("Phone already registered.");
    const nc = { id: genId(), name: newName.trim(), phone: newPhone };
    await upsertCustomer(shopCode, nc);
    setCustomers((p) => [...p, nc]);
    setCustSuccess(`"${nc.name}" added!`);
    setNewName(""); setNewPhone("");
    setSearch("");
    setShowAddForm(false);
  };

  return (
    <>
      {/* ── Search bar ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 10 }}>
          🔍 Search Customer
        </div>
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Name or phone number..."
          inputMode="text"
          style={{ ...inp, fontSize: 15, marginBottom: 0 }}
          autoFocus
        />

        {/* Not found → prompt to add */}
        {noResults && !showAddForm && (
          <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>No customer found</div>
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>"{search}" is not registered yet</div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              style={{ padding: "8px 14px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              + Add New
            </button>
          </div>
        )}

        {/* Inline add form */}
        {showAddForm && (
          <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#15803d", marginBottom: 10 }}>➕ Add New Customer</div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Full Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                style={inp}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Phone Number (optional)</label>
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile (optional)"
                inputMode="numeric"
                style={inp}
              />
            </div>
            {custError   && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8, background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ {custError}</div>}
            {custSuccess && <div style={{ color: "#16a34a", fontSize: 13, marginBottom: 8, background: "#f0fdf4", padding: "6px 10px", borderRadius: 6 }}>✅ {custSuccess}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setShowAddForm(false); setCustError(""); }}
                style={{ flex: 1, padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleCreate}
                style={{ flex: 2, padding: "11px 0", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ✅ Create Customer
              </button>
            </div>
          </div>
        )}

        {/* Add button when not searching */}
        {!q && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ width: "100%", marginTop: 10, padding: "10px 0", background: "#eff6ff", color: "#1e3a5f", border: "2px dashed #93c5fd", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            + Add New Customer
          </button>
        )}
      </div>

      {/* ── Customer list ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>
          👥 {q ? `Results (${filtered.length})` : `All Customers (${customers.length})`}
        </div>

        {filtered.length === 0 && !noResults && (
          <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
            No customers yet
          </div>
        )}

        {filtered.map((c, i) => {
          const txns        = transactions.filter((t) => t.customer?.id === c.id || t.customerId === c.id);
          const spent       = txns.filter((t) => !t.void && !t.cancelled).reduce((s, t) => s + (t.total || 0), 0);
          const outstanding = getCustomerOutstanding(c.id);
          return (
            <div key={c.id} onClick={() => onViewLedger(c)} style={{ padding: "12px 0", borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{c.phone || "No phone"} · {txns.length} bill{txns.length !== 1 ? "s" : ""}</div>
                  {outstanding > 0 && (
                    <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginTop: 2 }}>⚠ Outstanding: {f(outstanding)}</div>
                  )}
                  {outstanding < 0 && (
                    <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 700, marginTop: 2 }}>💰 Advance: {f(Math.abs(outstanding))}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 14 }}>{f(spent)}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>total billed</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {outstanding > 0 && (
                      <button onClick={(e) => { e.stopPropagation(); onSettle(c); }}
                        style={{ padding: "4px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        💳 Settle
                      </button>
                    )}
                    {outstanding < 0 && (
                      <span style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                        💰 Advance
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onViewLedger(c); }}
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
