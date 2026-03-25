import { useState } from "react";
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
import { BillingTab }   from "./tabs/BillingTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { HistoryTab }   from "./tabs/HistoryTab";
import { ProductsTab }  from "./tabs/ProductsTab";
import { SettingsTab }  from "./tabs/SettingsTab";

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

  // Role is NOT restored from localStorage on refresh.
  // The session token lives in memory only — once the page is refreshed
  // the token is gone, so the user must re-enter their PIN to get a
  // fresh token. This prevents "Unauthorised: Missing session token" errors.
  const [role, setRole] = useState(null);

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
    // Token lives in memory only — never written to localStorage
    if (token) setSessionToken(token);
  };

  const handleLogout = () => {
    setRole(null);
    clearSessionToken();
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
  const navTabs = isAdmin
    ? [["billing","🧾","Bill"], ["customers","👤","Customers"], ["history","📋","History"], ["products","📦","Products"], ["settings","⚙️","Settings"]]
    : [["billing","🧾","Bill"], ["customers","👤","Customers"], ["history","📋","History"]];

  // ─────────────────────────────────────────────
  // Screen guards (shown before main app)
  // ─────────────────────────────────────────────

  if (!shopCode)
    return <ShopCodeScreen onEnter={handleEnterShop} />;

  if (!ready)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 12, background: "linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)" }}>
        <div style={{ fontSize: 40 }}>🧵</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>FabricBill</div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Loading {shopCode}…</div>
      </div>
    );

  if (isNewShop)
    return (
      <RegisterScreen
        shopCode={shopCode}
        onRegistered={() => { setIsNewShop(false); }}
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
        {navTabs.map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: 1, padding: "10px 0 8px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: tab === key ? "#1e3a5f" : "#9ca3af", borderTop: tab === key ? "2px solid #1e3a5f" : "2px solid transparent" }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: tab === key ? 800 : 500 }}>{label}</span>
          </button>
        ))}
      </div>

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
