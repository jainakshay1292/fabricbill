// ─────────────────────────────────────────────
// hooks/useAppData.js
// Owns ALL data loading from the database and
// settings management.
//
// Any component that needs shop data should get
// it from here — never call API functions directly
// from a tab or component.
// ─────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  getSettings, saveSettings,
  getTransactions, getCustomers,
  getProducts, getSettlements,
  hashPin,
} from "../lib/api";
import { defaultSettings } from "../constants";

export function useAppData(shopCode) {
  const [ready, setReady]               = useState(false);
  const [isNewShop, setIsNewShop]       = useState(false);
  const [syncStatus, setSyncStatus]     = useState("idle"); // "idle" | "syncing" | "ok" | "error"

  const [settings, setSettings]         = useState(defaultSettings);
  const [draftSettings, setDraftSettings] = useState(defaultSettings);

  const [transactions, setTransactions] = useState([]);
  const [customers, setCustomers]       = useState([]);
  const [products, setProducts]         = useState([]);
  const [settlements, setSettlements]   = useState([]);

  // ── Load everything when shopCode is set ──────────────────
  useEffect(() => {
    if (!shopCode) return;
    setReady(false);

    (async () => {
      setSyncStatus("syncing");
      try {
        const s = await getSettings(shopCode);

        // No settings found → new shop, show registration screen
        if (!s) {
          setIsNewShop(true);
          setReady(true);
          return;
        }

        const merged = { ...defaultSettings, ...s };
        setSettings(merged);
        setDraftSettings(merged);

        // Load all data in parallel for speed
        const [txns, custs, prods, setts] = await Promise.all([
          getTransactions(shopCode),
          getCustomers(shopCode),
          getProducts(shopCode),
          getSettlements(shopCode),
        ]);

        setTransactions(txns || []);
        // Always keep at least one walk-in customer
        setCustomers(
          custs?.length ? custs : [{ id: "c1", name: "Walk-in Customer", phone: "" }]
        );
        setProducts(prods || []);
        setSettlements(setts || []);
        setIsNewShop(false);
        setSyncStatus("ok");
      } catch {
        setSyncStatus("error");
        setIsNewShop(true);
      }

      setReady(true);
    })();
  }, [shopCode]);

  // ── Save settings (called from SettingsTab) ───────────────
  const handleSaveSettings = async ({ newAdminPin, newStaffPin, onSuccess }) => {
    try {
      const updated = { ...draftSettings };
      // Only hash + update PIN if a new one was entered
      if (newAdminPin?.length === 4) updated.adminPinHash = await hashPin(newAdminPin);
      if (newStaffPin?.length === 4) updated.staffPinHash = await hashPin(newStaffPin);
      await saveSettings(shopCode, updated);
      setSettings(updated);
      onSuccess?.(updated);
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  };

  // ── Clear all local state when switching shops ────────────
  const handleChangeShop = () => {
    try {
      localStorage.removeItem("fabricbill_shopcode");
      localStorage.removeItem("fabricbill_session");
    } catch {}
    setReady(false);
    setTransactions([]);
    setCustomers([]);
    setProducts([]);
    setSettlements([]);
    setSettings(defaultSettings);
    setDraftSettings(defaultSettings);
  };

  return {
    // Status
    ready,
    isNewShop,
    setIsNewShop,
    syncStatus,
    setSyncStatus,

    // Settings
    settings,
    setSettings,
    draftSettings,
    setDraftSettings,
    handleSaveSettings,
    handleChangeShop,

    // Data + setters (tabs/hooks need setters to update after mutations)
    transactions,
    setTransactions,
    customers,
    setCustomers,
    products,
    setProducts,
    settlements,
    setSettlements,
  };
}
