// ─────────────────────────────────────────────
// tabs/AttendanceTab.jsx
// Admin-only tab with two sections:
//   1. Employees — master list (name, salary, joining date)
//   2. Attendance — mark present/absent per day, monthly summary
// ─────────────────────────────────────────────
import { useState, useEffect, useCallback } from "react";
import { card, inp, lbl } from "../styles";
import { fmt, fmtDate } from "../utils/format";
import { genId } from "../utils/misc";

// ── API helpers (employees + attendance use /api/db) ──────────
const call = async (body) => {
  const session = (() => { try { return JSON.parse(localStorage.getItem("fabricbill_session") || "{}"); } catch { return {}; } })();
  const r = await fetch("/api/db", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token: session.token }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
};

const getEmployees   = (sc) => call({ action: "getAll", shopCode: sc, table: "employees" });
const upsertEmployee = (sc, emp) => call({ action: "upsert", shopCode: sc, table: "employees", id: emp.id, data: emp });
const deleteEmployee = (sc, id)  => call({ action: "delete", shopCode: sc, table: "employees", id });
const getAttendance  = (sc) => call({ action: "getAll", shopCode: sc, table: "attendance" });
const upsertAttendance = (sc, rec) => call({ action: "upsert", shopCode: sc, table: "attendance", id: rec.id, data: rec });

// ── Month helpers ─────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── Component ─────────────────────────────────────────────────
export function AttendanceTab({ shopCode, isAdmin }) {
  const [view, setView]           = useState("attendance"); // "attendance" | "employees"
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({}); // { "empId::YYYY-MM-DD": "P"|"A"|"H" }
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // Selected month
  const today = new Date();
  const [selYear,  setSelYear]  = useState(today.getFullYear());
  const [selMonth, setSelMonth] = useState(today.getMonth());

  // Employee form
  const [showForm,    setShowForm]    = useState(false);
  const [editEmp,     setEditEmp]     = useState(null);
  const [empName,     setEmpName]     = useState("");
  const [empSalary,   setEmpSalary]   = useState("");
  const [empJoining,  setEmpJoining]  = useState("");
  const [empMsg,      setEmpMsg]      = useState("");

  // ── Load data ───────────────────────────────────────────────
  useEffect(() => {
    if (!shopCode) return;
    setLoading(true);
    Promise.all([getEmployees(shopCode), getAttendance(shopCode)])
      .then(([emps, atts]) => {
        setEmployees(
          (emps || []).sort((a, b) => a.name.localeCompare(b.name))
        );
        // Convert attendance array → lookup map keyed by "empId::date"
        const map = {};
        (atts || []).forEach((a) => { map[`${a.empId}::${a.date}`] = a.status; });
        setAttendance(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shopCode]);

  // ── Mark attendance ─────────────────────────────────────────
  const markAttendance = useCallback(async (empId, date, status) => {
    const key = `${empId}::${date}`;
    const prev = attendance[key];
    // Cycle: unmarked → P → A → H → unmarked
    const next = !prev ? "P" : prev === "P" ? "A" : prev === "A" ? "H" : null;

    // Optimistic update
    setAttendance((m) => {
      const updated = { ...m };
      if (next) updated[key] = next;
      else delete updated[key];
      return updated;
    });

    setSaving(true);
    try {
      const rec = {
        id:     `${empId}::${date}`,
        empId,
        date,
        status: next || "X", // X = delete marker
      };
      await upsertAttendance(shopCode, rec);
    } catch (e) {
      alert("Failed to save: " + e.message);
      // Revert on error
      setAttendance((m) => { const r = { ...m }; if (prev) r[key] = prev; else delete r[key]; return r; });
    } finally {
      setSaving(false);
    }
  }, [attendance, shopCode]);

  // ── Employee form handlers ──────────────────────────────────
  const openAddForm = () => {
    setEditEmp(null); setEmpName(""); setEmpSalary(""); setEmpJoining(""); setEmpMsg(""); setShowForm(true);
  };

  const openEditForm = (emp) => {
    setEditEmp(emp);
    setEmpName(emp.name);
    setEmpSalary(String(emp.salary || ""));
    setEmpJoining(emp.joiningDate || "");
    setEmpMsg("");
    setShowForm(true);
  };

  const handleSaveEmployee = async () => {
    setEmpMsg("");
    if (!empName.trim()) return setEmpMsg("Name is required.");
    if (!empSalary || isNaN(parseFloat(empSalary)) || parseFloat(empSalary) < 0) return setEmpMsg("Enter valid salary.");
    const emp = {
      id:          editEmp ? editEmp.id : genId(),
      name:        empName.trim(),
      salary:      parseFloat(empSalary),
      joiningDate: empJoining || null,
    };
    try {
      await upsertEmployee(shopCode, emp);
      setEmployees((prev) => {
        const filtered = prev.filter((e) => e.id !== emp.id);
        return [...filtered, emp].sort((a, b) => a.name.localeCompare(b.name));
      });
      setShowForm(false);
    } catch (e) {
      setEmpMsg("Save failed: " + e.message);
    }
  };

  const handleDeleteEmployee = async (emp) => {
    if (!window.confirm(`Delete "${emp.name}"? This will also remove their attendance records.`)) return;
    try {
      await deleteEmployee(shopCode, emp.id);
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  };

  // ── Monthly summary for one employee ───────────────────────
  const getMonthlySummary = (empId) => {
    const days   = getDaysInMonth(selYear, selMonth);
    let present  = 0, absent = 0, halfDay = 0, unmarked = 0;
    for (let d = 1; d <= days; d++) {
      const date   = `${selYear}-${String(selMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const status = attendance[`${empId}::${date}`];
      if      (status === "P") present++;
      else if (status === "A") absent++;
      else if (status === "H") halfDay++;
      else unmarked++;
    }
    return { present, absent, halfDay, unmarked, days };
  };

  // Days in selected month
  const daysInMonth = getDaysInMonth(selYear, selMonth);
  const today_str   = todayStr();

  if (loading) return (
    <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading attendance…</div>
  );

  return (
    <>
      {/* ── Sub-nav ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["attendance","🗓️","Attendance"], ["employees","👥","Employees"]].map(([v, icon, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: view === v ? "#1e3a5f" : "#fff",
              color:      view === v ? "#fff"    : "#6b7280",
              boxShadow:  view === v ? "0 2px 8px rgba(30,58,95,0.15)" : "none",
            }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          ATTENDANCE VIEW
      ════════════════════════════════════════════ */}
      {view === "attendance" && (
        <>
          {/* Month selector */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button onClick={() => { let m = selMonth - 1, y = selYear; if (m < 0) { m = 11; y--; } setSelMonth(m); setSelYear(y); }}
                style={{ width: 36, height: 36, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 18, cursor: "pointer", fontWeight: 700 }}>‹</button>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f" }}>{MONTHS[selMonth]} {selYear}</div>
              <button onClick={() => { let m = selMonth + 1, y = selYear; if (m > 11) { m = 0; y++; } setSelMonth(m); setSelYear(y); }}
                style={{ width: 36, height: 36, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb", fontSize: 18, cursor: "pointer", fontWeight: 700 }}>›</button>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 10, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {[["P","#16a34a","#f0fdf4","Present"],["A","#dc2626","#fee2e2","Absent"],["H","#d97706","#fffbeb","Half Day"],["–","#9ca3af","#f3f4f6","Unmarked"]].map(([s,c,bg,label]) => (
                <span key={s} style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, borderRadius: 6, padding: "2px 8px" }}>{s} = {label}</span>
              ))}
            </div>
          </div>

          {employees.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: "#9ca3af", padding: 30 }}>
              No employees yet. Add employees first.
            </div>
          )}

          {/* Per-employee attendance grid */}
          {employees.map((emp) => {
            const summary = getMonthlySummary(emp.id);
            return (
              <div key={emp.id} style={card}>
                {/* Employee header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>₹{emp.salary?.toLocaleString("en-IN")}/month</div>
                  </div>
                  {/* Summary pills */}
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", borderRadius: 6, padding: "2px 7px" }}>P:{summary.present}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#fee2e2", color: "#dc2626", borderRadius: 6, padding: "2px 7px" }}>A:{summary.absent}</span>
                    {summary.halfDay > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: "#fffbeb", color: "#d97706", borderRadius: 6, padding: "2px 7px" }}>H:{summary.halfDay}</span>}
                  </div>
                </div>

                {/* Day grid — 7 columns */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const date   = `${selYear}-${String(selMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                    const status = attendance[`${emp.id}::${date}`];
                    const isFut  = date > today_str;
                    const isToday = date === today_str;
                    const bg     = status === "P" ? "#16a34a" : status === "A" ? "#dc2626" : status === "H" ? "#d97706" : isFut ? "#f9fafb" : "#f3f4f6";
                    const color  = status ? "#fff" : isFut ? "#d1d5db" : "#9ca3af";
                    return (
                      <button key={d} onClick={() => !isFut && isAdmin && markAttendance(emp.id, date, status)}
                        disabled={isFut || !isAdmin || saving}
                        style={{
                          border: isToday ? "2px solid #1e3a5f" : "1px solid transparent",
                          borderRadius: 6, background: bg, color,
                          fontWeight: status ? 800 : 400, fontSize: 12,
                          padding: "6px 2px", cursor: isFut || !isAdmin ? "default" : "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                        }}>
                        <span style={{ fontSize: 10, opacity: 0.7 }}>{d}</span>
                        <span>{status || (isFut ? "" : "·")}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Salary calculation */}
                {(summary.present > 0 || summary.halfDay > 0) && (() => {
                  const effectiveDays = summary.present + summary.halfDay * 0.5;
                  const perDay = emp.salary / daysInMonth;
                  const earned = Math.round(perDay * effectiveDays);
                  return (
                    <div style={{ marginTop: 10, background: "#f8faff", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#6b7280" }}>{effectiveDays} days × ₹{Math.round(perDay)}/day</span>
                      <span style={{ fontWeight: 800, color: "#1e3a5f" }}>₹{earned.toLocaleString("en-IN")}</span>
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Monthly summary table */}
          {employees.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>📊 {MONTHS[selMonth]} Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 40px 80px", gap: 4, fontSize: 11, fontWeight: 700, color: "#9ca3af", paddingBottom: 8, borderBottom: "1px solid #e5e7eb", marginBottom: 4 }}>
                <span>Employee</span>
                <span style={{ textAlign: "center" }}>P</span>
                <span style={{ textAlign: "center" }}>A</span>
                <span style={{ textAlign: "center" }}>H</span>
                <span style={{ textAlign: "right" }}>Salary</span>
              </div>
              {employees.map((emp) => {
                const s = getMonthlySummary(emp.id);
                const effectiveDays = s.present + s.halfDay * 0.5;
                const earned = Math.round((emp.salary / daysInMonth) * effectiveDays);
                return (
                  <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 40px 80px", gap: 4, padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13, alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{emp.name}</span>
                    <span style={{ textAlign: "center", color: "#16a34a", fontWeight: 700 }}>{s.present}</span>
                    <span style={{ textAlign: "center", color: "#dc2626", fontWeight: 700 }}>{s.absent}</span>
                    <span style={{ textAlign: "center", color: "#d97706", fontWeight: 700 }}>{s.halfDay}</span>
                    <span style={{ textAlign: "right", fontWeight: 800, color: "#1e3a5f" }}>₹{earned.toLocaleString("en-IN")}</span>
                  </div>
                );
              })}
              {/* Total row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px 40px 80px", gap: 4, padding: "10px 0 0", fontSize: 13, fontWeight: 800, color: "#1e3a5f", borderTop: "2px solid #e5e7eb", marginTop: 4 }}>
                <span>Total</span>
                <span style={{ textAlign: "center" }}>{employees.reduce((s,e) => s + getMonthlySummary(e.id).present, 0)}</span>
                <span style={{ textAlign: "center" }}>{employees.reduce((s,e) => s + getMonthlySummary(e.id).absent, 0)}</span>
                <span style={{ textAlign: "center" }}>{employees.reduce((s,e) => s + getMonthlySummary(e.id).halfDay, 0)}</span>
                <span style={{ textAlign: "right" }}>
                  ₹{employees.reduce((s, emp) => {
                    const sum = getMonthlySummary(emp.id);
                    return s + Math.round((emp.salary / daysInMonth) * (sum.present + sum.halfDay * 0.5));
                  }, 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════
          EMPLOYEES VIEW
      ════════════════════════════════════════════ */}
      {view === "employees" && (
        <>
          {/* Add / Edit form */}
          {showForm ? (
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 14 }}>
                {editEmp ? "✏️ Edit Employee" : "➕ Add Employee"}
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Full Name</label>
                <input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="e.g. Ramesh Kumar" style={inp} autoFocus />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Monthly Salary (₹)</label>
                <input type="number" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} placeholder="e.g. 12000" style={inp} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Joining Date</label>
                <input type="date" value={empJoining} onChange={(e) => setEmpJoining(e.target.value)} style={inp} />
              </div>
              {empMsg && (
                <div style={{ fontSize: 13, marginBottom: 10, color: "#dc2626", background: "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>⚠ {empMsg}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: "11px 0", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleSaveEmployee}
                  style={{ flex: 2, padding: "11px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  {editEmp ? "Save Changes" : "Add Employee"}
                </button>
              </div>
            </div>
          ) : (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>👥 Employees ({employees.length})</div>
                {isAdmin && (
                  <button onClick={openAddForm}
                    style={{ padding: "8px 14px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    + Add
                  </button>
                )}
              </div>

              {employees.length === 0 && (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "20px 0", fontSize: 13 }}>No employees yet. Tap + Add to get started.</div>
              )}

              {employees.map((emp, i) => (
                <div key={emp.id} style={{ padding: "12px 0", borderBottom: i < employees.length - 1 ? "1px solid #f3f4f6" : "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      ₹{emp.salary?.toLocaleString("en-IN")}/month
                      {emp.joiningDate ? ` · Joined ${fmtDate(emp.joiningDate)}` : ""}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEditForm(emp)}
                        style={{ padding: "5px 10px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={() => handleDeleteEmployee(emp)}
                        style={{ padding: "5px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
