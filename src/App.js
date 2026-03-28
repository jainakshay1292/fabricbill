import { useState, useEffect } from "react";
import { setSessionToken, clearSessionToken } from "./lib/api";

// Styles
import { injectGlobalStyles } from "./styles";

// Hooks
import { useAppData } from "./hooks/useAppData";
import { useBilling } from "./hooks/useBilling";
import { useCredit }  from "./hooks/useCredit";

// Screens (shown before login)
import { ShopCodeScreen } from "./screens/ShopCodeScreen";
import { RegisterScreen } from "./screens/RegisterScreen";
import { LoginScreen }    from "./screens/LoginScreen";

// Tabs (shown after login)
import { BillingTab }      from "./tabs/BillingTab";
import { AttendanceTab }   from "./tabs/AttendanceTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { HistoryTab }   from "./tabs/HistoryTab";
import { ProductsTab }  from "./tabs/ProductsTab";
import { SettingsTab }    from "./tabs/SettingsTab";

// Modals — InvoiceView is default export, rest are named exports
import InvoiceView           from "./components/InvoiceView";
import { EditInvoiceModal }  from "./components/EditInvoiceModal";
import { CreditSettleModal } from "./components/CreditSettleModal";
import { ReceiptVoucher }    from "./components/ReceiptVoucher";
import { CustomerLedger }    from "./components/CustomerLedger";

// Inject global CSS once on load
injectGlobalStyles();

// ── Sync badge config ─────────────────────────
const SYNC_BADGE = {
  idle:    null,
  syncing: ["🔄", "#f59e0b"],
  ok:      ["☁️", "#16a34a"],
  error:   ["⚠️", "#dc2626"],
};

export default function App() {

  // ── Persistent state (survives page refresh) ──
  const [shopCode, setShopCode] = useState(() => {
    try { return localStorage.getItem("fabricbill_shopcode") || null; } catch { return null; }
  });

  // Restore role + token from localStorage so user doesn't need to
  // re-enter PIN on every refresh. Token expiry is checked on load —
  // if expired, role is null and PIN screen shows as normal.
  const [role, setRole] = useState(() => {
    try {
      const s = localStorage.getItem("fabricbill_session");
      if (!s) return null;
      const { role, token, expiry } = JSON.parse(s);
      if (!role || !token || Date.now() > expiry) return null;
      return role;
    } catch { return null; }
  });

  // Re-hydrate the session token into memory on first render.
  // Must be done outside useState (which can't call module functions directly).
  useEffect(() => {
    try {
      const s = localStorage.getItem("fabricbill_session");
      if (!s) return;
      const { token, expiry } = JSON.parse(s);
      if (token && Date.now() < expiry) setSessionToken(token);
    } catch {}
  }, []); // runs once on mount

  // ── UI state ──────────────────────────────────
  const [tab, setTab] = useState("billing");

  // Modal state — which overlay is open
  const [showReceipt,    setShowReceipt]    = useState(null); // txn object
  const [editTxn,        setEditTxn]        = useState(null); // txn object
  const [settleCustomer, setSettleCustomer] = useState(null); // customer object
  const [showVoucher,    setShowVoucher]    = useState(null); // voucher object
  const [showLedger,     setShowLedger]     = useState(null); // customer object

  // ── Data hook ─────────────────────────────────
  const appData = useAppData(shopCode);
  const {
    ready, isNewShop, setIsNewShop, syncStatus,
    settings, draftSettings, setDraftSettings,
    transactions, setTransactions,
    customers, setCustomers,
    products, setProducts,
    settlements, setSettlements,
    handleSaveSettings, handleChangeShop: _handleChangeShop,
  } = appData;

  // ── Billing hook ──────────────────────────────
  const billing = useBilling({
    shopCode, role, settings, products, customers, setTransactions,
  });

  // ── Credit hook ───────────────────────────────
  const { getCustomerOutstanding, handleSettle } = useCredit({
    shopCode, role, transactions, settlements, setSettlements,
  });

  const isAdmin = role === "admin";

  // ── Auth helpers ──────────────────────────────
  const handleLogin = (r, token) => {
    setRole(r);
    setTab("billing");
    if (token) {
      setSessionToken(token);
      // Persist token so refresh doesn't require re-entering PIN.
      // Token expires in 24h — after that the PIN screen shows again.
      try {
        localStorage.setItem("fabricbill_session", JSON.stringify({
          role:   r,
          token,
          expiry: Date.now() + 24 * 60 * 60 * 1000,
        }));
      } catch {}
    }
  };

  const handleLogout = () => {
    setRole(null);
    clearSessionToken();
    try { localStorage.removeItem("fabricbill_session"); } catch {}
  };

  const handleEnterShop = (code) => {
    setShopCode(code);
    try { localStorage.setItem("fabricbill_shopcode", code); } catch {}
  };

  const handleChangeShop = () => {
    _handleChangeShop();
    setShopCode(null);
    setRole(null);
  };

  // ── Invoice edit / void ───────────────────────
  const handleEditSave = async (txn) => {
    const { updateTransaction } = await import("./lib/api");
    await updateTransaction(shopCode, txn);
    setTransactions((p) => p.map((t) => (t.id === txn.id ? txn : t)));
    setEditTxn(null);
    setShowReceipt(txn);
  };

  const handleVoidInvoice = async (txn) => {
    const { updateTransaction } = await import("./lib/api");
    const voided = {
      ...txn,
      void: true,
      voidedAt: new Date().toISOString(),
      total: 0, subtotal: 0, taxable: 0, gst: 0, discount: 0,
      payments: (txn.payments || []).map((p) => ({ ...p, amount: 0 })),
    };
    await updateTransaction(shopCode, voided);
    setTransactions((p) => p.map((t) => (t.id === voided.id ? voided : t)));
    setEditTxn(null);
    setShowReceipt(voided);
  };

  // ── Credit settlement ─────────────────────────
  const handleSettleConfirm = async (amount, mode) => {
    try {
      const voucher = await handleSettle(settleCustomer, amount, mode);
      setSettleCustomer(null);
      setShowVoucher(voucher);
    } catch (e) {
      alert("Settlement failed: " + e.message);
    }
  };

  // ── Nav tabs (staff can't see Products / Settings) ──
  // Core tabs always visible in bottom nav
  const navTabs = [
    ["billing",   "🧾", "Bill"],
    ["customers", "👤", "Customers"],
    ["history",   "📋", "History"],
    ["more",      "⋯",  "More"],
  ];

  // Items inside the More drawer — admin sees everything, staff sees less
  const moreItems = isAdmin
    ? [
        ["products",   "📦", "Products",   "Manage your product catalogue"],
        ["attendance", "🗓️", "Attendance",  "Track staff attendance"],
        ["settings",   "⚙️", "Settings",   "Shop & billing settings"],
      ]
    : [
        ["attendance", "🗓️", "Attendance", "View your attendance"],
      ];

  // ─────────────────────────────────────────────
  // Screen guards (shown before main app)
  // ─────────────────────────────────────────────

  if (!shopCode)
    return <ShopCodeScreen onEnter={handleEnterShop} />;

  if (!ready)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12, background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", padding: 24 }}>
        <div style={{ fontSize: 40 }}>🧵</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>FabricBill</div>
        {syncStatus === "error" ? (
          <>
            <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center" }}>
              Could not connect. Check your internet and try again.
            </div>
            <button
              onClick={() => { window.location.reload(); }}
              style={{ marginTop: 8, padding: "10px 28px", background: "#fff", color: "#1e3a5f", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              🔄 Retry
            </button>
            <button
              onClick={handleChangeShop}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", marginTop: 4 }}>
              ← Change Shop
            </button>
          </>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Loading {shopCode}…</div>
        )}
      </div>
    );

  if (isNewShop)
    return (
      <RegisterScreen
        shopCode={shopCode}
        onRegistered={() => { setIsNewShop(false); }}
        onBack={handleChangeShop}
      />
    );

  if (!role)
    return (
      <LoginScreen
        onLogin={handleLogin}
        shopCode={shopCode}
        onChangeShop={handleChangeShop}
      />
    );

  // ─────────────────────────────────────────────
  // Main app shell
  // ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans',-apple-system,sans-serif", background: "#f0f2f5", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: "#1e3a5f", color: "#fff", padding: "12px 16px", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{settings.shopName}</div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 1 }}>
            🏪 {shopCode} · {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {SYNC_BADGE[syncStatus] && (
            <span style={{ background: SYNC_BADGE[syncStatus][1], color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
              {SYNC_BADGE[syncStatus][0]}
            </span>
          )}
          <span style={{ background: isAdmin ? "#fbbf24" : "#34d399", color: "#1e3a5f", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800 }}>
            {isAdmin ? "🔐 Admin" : "👤 Staff"}
          </span>
          <button
            onClick={handleLogout}
            style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "#fff", padding: "5px 10px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
            Logout
          </button>
        </div>
      </div>

      {/* ── Active tab content ── */}
      <div style={{ padding: "14px 12px" }}>

        {tab === "billing" && (
          <BillingTab
  {...billing}
  customers={customers}
  products={products}
  settings={settings}
  onGoToCustomers={() => setTab("customers")}
  handleConfirmPayment={async () => {
    const txn = await billing.handleConfirmPayment();
    if (txn) setShowReceipt(txn);
  }}
  billDate={billing.billDate}
  setBillDate={billing.setBillDate}
/>
        )}

        {tab === "customers" && (
          <CustomersTab
            customers={customers}
            setCustomers={setCustomers}
            transactions={transactions}
            settlements={settlements}
            getCustomerOutstanding={getCustomerOutstanding}
            settings={settings}
            shopCode={shopCode}
            onSettle={(c) => setSettleCustomer(c)}
            onViewLedger={(c) => setShowLedger(c)}
          />
        )}

        {tab === "history" && (
          <HistoryTab
            transactions={transactions}
            settlements={settlements}
            customers={customers}
            settings={settings}
            isAdmin={isAdmin}
            getCustomerOutstanding={getCustomerOutstanding}
            onViewReceipt={(txn) => setShowReceipt(txn)}
            onEditTxn={(txn) => setEditTxn(txn)}
            onSettle={(c) => setSettleCustomer(c)}
            onViewVoucher={(v) => setShowVoucher(v)}
          />
        )}

        {tab === "products" && isAdmin && (
          <ProductsTab
            products={products}
            setProducts={setProducts}
            settings={settings}
            shopCode={shopCode}
          />
        )}

        {tab === "attendance" && (
          <AttendanceTab shopCode={shopCode} isAdmin={isAdmin} />
        )}

        {tab === "settings" && isAdmin && (
          <SettingsTab
            draftSettings={draftSettings}
            setDraftSettings={setDraftSettings}
            handleSaveSettings={handleSaveSettings}
            handleChangeShop={handleChangeShop}
            shopCode={shopCode}
          />
        )}

      </div>

      {/* ── Bottom nav ── */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #e5e7eb", display: "flex", zIndex: 50, boxShadow: "0 -2px 8px rgba(0,0,0,0.06)" }}>
        {navTabs.map(([key, icon, label]) => {
          const isMoreActive = key === "more" && ["products","attendance","settings"].includes(tab);
          const isActive     = tab === key || isMoreActive;
          return (
            <button key={key}
              onClick={() => key === "more" ? setTab("more") : setTab(key)}
              style={{ flex: 1, padding: "10px 0 8px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: isActive ? "#1e3a5f" : "#9ca3af", borderTop: isActive ? "2px solid #1e3a5f" : "2px solid transparent" }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 9, fontWeight: isActive ? 800 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── More drawer ── */}
      {tab === "more" && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
          onClick={() => setTab("billing")}
        >
          <div
            style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", padding: 20, paddingBottom: 90 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f", marginBottom: 16 }}>More</div>
            {moreItems.map(([key, icon, label, desc]) => (
              <button key={key}
                onClick={() => setTab(key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", marginBottom: 8, background: "#f8faff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 26 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e3a5f" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{desc}</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 18, color: "#d1d5db" }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showReceipt && (
        <InvoiceView
          txn={showReceipt}
          settings={settings}
          onClose={() => setShowReceipt(null)}
        />
      )}
      {editTxn && (
  <EditInvoiceModal
    txn={editTxn}
    products={products}
    customers={customers}
    settings={settings}
    onSave={handleEditSave}
    onCancel={() => setEditTxn(null)}
    onVoidInvoice={() => handleVoidInvoice(editTxn)}
  />
)}
      {settleCustomer && (
        <CreditSettleModal
          customer={settleCustomer}
          outstanding={getCustomerOutstanding(settleCustomer.id)}
          settings={settings}
          onConfirm={handleSettleConfirm}
          onCancel={() => setSettleCustomer(null)}
        />
      )}
      {showVoucher && (
        <ReceiptVoucher
          voucher={showVoucher}
          settings={settings}
          onClose={() => setShowVoucher(null)}
        />
      )}
      {showLedger && (
        <CustomerLedger
          customer={showLedger}
          transactions={transactions}
          settlements={settlements}
          getCustomerOutstanding={getCustomerOutstanding}
          settings={settings}
          onClose={() => setShowLedger(null)}
        />
      )}

    </div>
  );
}
