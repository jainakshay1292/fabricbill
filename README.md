# 🧵 FabricBill

> GST Billing Software for Fabric Shops — built with React, deployed on Vercel.

**Live App:** [fabricbill.vercel.app](https://fabricbill.vercel.app)

---

## 📱 What It Does

- GST invoice generation (5% / 18% auto-calculated)
- Multi-mode payments — Cash, UPI, Card, Credit
- Split payment support
- Credit outstanding tracking per customer
- Settlement receipts / vouchers
- Sales reports with CSV export
- Admin + Staff role login with PIN
- Print / WhatsApp / PDF / Thermal invoice sharing
- Multi-shop support via shop codes

---

## 🗂️ Project Structure

```
src/
├── App.js                  # Root — routing, hooks wiring, modal state
│
├── constants/
│   └── index.js            # PAYMENT_MODES, GST_RATES, defaultSettings
│
├── styles/
│   └── index.js            # Shared inline style objects + global CSS injection
│
├── utils/
│   ├── format.js           # fmt, fmtDate, fmtDateTime, numToWords
│   ├── misc.js             # genId, getFinYear, isWithin24Hours
│   ├── csv.js              # toCSV, downloadCSV
│   └── gst.js              # getItemGstRate, buildGstRows
│
├── hooks/
│   ├── useAppData.js       # All DB loading, settings, sync status
│   ├── useBilling.js       # Cart state, GST calculations, save invoice
│   └── useCredit.js        # Outstanding balance, settlement logic
│
├── screens/                # Shown BEFORE login
│   ├── ShopCodeScreen.jsx  # Enter shop code
│   ├── RegisterScreen.jsx  # First-time shop setup
│   └── LoginScreen.jsx     # PIN pad login (Admin / Staff)
│
├── components/             # Reusable modals & UI
│   ├── GstSelect.jsx       # GST rate dropdown
│   ├── InvoiceView.jsx     # Full invoice modal (print/WA/PDF/thermal)
│   ├── EditInvoiceModal.jsx# Edit invoice within 24hrs or void it
│   ├── CreditSettleModal.jsx # Collect payment against credit
│   ├── ReceiptVoucher.jsx  # Settlement receipt modal
│   └── CustomerLedger.jsx  # Customer transaction history
│
├── tabs/                   # Main app screens (shown AFTER login)
│   ├── BillingTab.jsx      # Create bills
│   ├── CustomersTab.jsx    # Add/view customers
│   ├── HistoryTab.jsx      # Bills list + sales report + credit report
│   ├── ProductsTab.jsx     # Manage products with GST overrides
│   └── SettingsTab.jsx     # Shop info, GST config, PINs
│
└── lib/
    └── api.js              # All database calls (Netlify Functions)
```

---

## 🔐 Roles

| Role  | Access |
|-------|--------|
| Admin | All tabs + edit/void invoices + reports + settings |
| Staff | Billing + Customers + History (bills only) |

---

## 🏛️ GST Logic

- Items below threshold → **Low GST rate** (default 5%)
- Items above threshold → **High GST rate** (default 18%)
- Products can have a **fixed GST override** set in Products tab (★)
- All rates configurable per shop in Settings

> Rule: If item value (after discount) ≥ `gstThreshold × (1 + gstLow/100)` → use `gstHigh`, else `gstLow`

---

## ➕ How to Add Things

| What | Where |
|------|-------|
| New payment mode | `constants/index.js` → `PAYMENT_MODES` |
| New GST rate | `constants/index.js` → `GST_RATES` |
| New setting field | `constants/index.js` → `defaultSettings` + `tabs/SettingsTab.jsx` |
| New utility function | `utils/format.js` or `utils/misc.js` |
| New modal/popup | `components/` |
| New tab/screen | `tabs/` + add to `navTabs` in `App.js` |
| New DB call | `lib/api.js` + `api/` (Netlify Function) |

---

## 🚀 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React (CRA) |
| Hosting | Vercel |
| Backend | Netlify Functions |
| Database | FaunaDB / Supabase (via `lib/api.js`) |
| Styling | Inline styles + DM Sans font |

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm start

# Build for production
npm run build
```

---

## 📦 Deployment

Push to `main` branch → Vercel auto-deploys.

For safe changes:
```bash
git checkout -b feature/your-feature
# make changes
git add .
git commit -m "feat: description"
git push
# test on Vercel preview URL before merging to main
```

---

## 👤 Author

**Jainakshay1292** — [github.com/jainakshay1292](https://github.com/jainakshay1292)
