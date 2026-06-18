"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Settings as SettingsIcon,
  Link2,
  Power,
  Wallet,
  RefreshCw,
  Bell,
  ShieldCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
  Users,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getSettings as getFirestoreSettings,
  saveSettings as saveFirestoreSettings,
  DEFAULT_SETTINGS,
  type AppSettings as FirestoreAppSettings,
  getZerodhaAccounts,
  saveZerodhaAccount,
  removeZerodhaAccount,
  resetPaperTrading,
  applyPaperStartingBalanceIfFlat,
  updateZerodhaAccountLabel,
  type ZerodhaAccount,
} from "@/lib/firebase";
import {
  loadSettingsFromCache as loadFlatSettingsCache,
  saveSettingsToCache,
} from "@/lib/settings/cache";

interface ServerAccount {
  kiteUserId: string;
  userName?: string;
  email?: string;
  broker?: string;
  connected: boolean;
  profileError?: boolean;
}

interface AppSettings {
  paperTrading: {
    startingBalance: number;
    simulateBrokerage: boolean;
    /** Target rupee value per paper BUY (default ₹1,00,000). */
    orderNotional: number;
    defaultProductType: "CNC" | "MIS";
    positionSizingMode: "notional" | "portfolio_pct" | "atr_risk";
    positionPct: number;
    atrRiskPct: number;
    atrPeriod: number;
  };
  tradingPreferences: {
    defaultExchange: "NSE" | "BSE";
    defaultProductType: "MIS" | "CNC" | "NRML";
    defaultOrderType: "MARKET" | "LIMIT";
    maxOrderValue: number;
    maxDailyLoss: number;
  };
  notifications: {
    orderExecution: boolean;
    emailDigest: boolean;
    skippedOrders: boolean;
    riskExits: boolean;
    strategySignals: boolean;
    pnlAlerts: boolean;
  };
  riskManagement: {
    stopLossPercent: number;
    takeProfitPercent: number;
    autoStopLoss: boolean;
    autoTakeProfit: boolean;
    maxPositions: number;
    squareOffTime: string;
    rebuyCooldownMinutes: number;
    maxRoundTripsPerSymbolPerDay: number;
    noSameDayRebuyAfterSell: boolean;
    minHoldMinutesBeforeSell: number;
    enableStrategySellSignals: boolean;
    strategySellMinSignals: number;
    autoTrailingStop: boolean;
    trailingStopPercent: number;
    maxHoldDays: number;
    noProgressDays: number;
    noProgressMinPct: number;
    autoPauseEnabled: boolean;
    autoPauseLookbackDays: number;
    autoPauseMaxLoss: number;
  };
}

const defaultSettings: AppSettings = {
  paperTrading: {
    startingBalance: 1000000,
    simulateBrokerage: true,
    orderNotional: 100_000,
    defaultProductType: "CNC",
    positionSizingMode: "portfolio_pct",
    positionPct: 10,
    atrRiskPct: 1,
    atrPeriod: 14,
  },
  tradingPreferences: {
    defaultExchange: "NSE",
    defaultProductType: "CNC",
    defaultOrderType: "MARKET",
    maxOrderValue: 500_000,
    maxDailyLoss: 50000,
  },
  notifications: {
    orderExecution: true,
    emailDigest: true,
    skippedOrders: false,
    riskExits: true,
    strategySignals: false,
    pnlAlerts: false,
  },
  riskManagement: {
    stopLossPercent: 2,
    takeProfitPercent: 5,
    autoStopLoss: true,
    autoTakeProfit: false,
    maxPositions: 5,
    squareOffTime: "15:15",
    rebuyCooldownMinutes: 240,
    maxRoundTripsPerSymbolPerDay: 1,
    noSameDayRebuyAfterSell: true,
    minHoldMinutesBeforeSell: 60,
    enableStrategySellSignals: true,
    strategySellMinSignals: 2,
    autoTrailingStop: true,
    trailingStopPercent: 2,
    maxHoldDays: 10,
    noProgressDays: 5,
    noProgressMinPct: 0.5,
    autoPauseEnabled: false,
    autoPauseLookbackDays: 14,
    autoPauseMaxLoss: 5000,
  },
};

function firestoreToLocal(fs: FirestoreAppSettings): AppSettings {
  return {
    paperTrading: {
      startingBalance: fs.paperStartingBalance,
      simulateBrokerage: fs.simulateBrokerage,
      orderNotional: fs.paperOrderNotional ?? 100_000,
      defaultProductType: (fs.paperDefaultProduct as "CNC" | "MIS") ?? "CNC",
      positionSizingMode:
        (fs.positionSizingMode as "notional" | "portfolio_pct" | "atr_risk") ??
        "portfolio_pct",
      positionPct: fs.positionPct ?? 10,
      atrRiskPct: fs.atrRiskPct ?? 1,
      atrPeriod: fs.atrPeriod ?? 14,
    },
    tradingPreferences: {
      defaultExchange: fs.defaultExchange as "NSE" | "BSE",
      defaultProductType: fs.defaultProduct as "MIS" | "CNC" | "NRML",
      defaultOrderType: fs.defaultOrderType as "MARKET" | "LIMIT",
      maxOrderValue: fs.maxOrderValue,
      maxDailyLoss: fs.maxDailyLoss,
    },
    notifications: {
      orderExecution: fs.notifyOrders,
      emailDigest: fs.notifyEmailDigest !== false,
      skippedOrders: fs.notifySkipped === true,
      riskExits: fs.notifyRiskExits !== false,
      strategySignals: fs.notifySignals === true,
      pnlAlerts: fs.notifyPnl,
    },
    riskManagement: {
      stopLossPercent: fs.stopLossPercent,
      takeProfitPercent: fs.takeProfitPercent,
      autoStopLoss: fs.autoStopLoss ?? true,
      autoTakeProfit: fs.autoTakeProfit ?? true,
      maxPositions: fs.maxPositions,
      squareOffTime: fs.squareOffTime,
      rebuyCooldownMinutes: fs.rebuyCooldownMinutes ?? 240,
      maxRoundTripsPerSymbolPerDay: fs.maxRoundTripsPerSymbolPerDay ?? 1,
      noSameDayRebuyAfterSell: fs.noSameDayRebuyAfterSell !== false,
      minHoldMinutesBeforeSell: fs.minHoldMinutesBeforeSell ?? 60,
      enableStrategySellSignals: fs.enableStrategySellSignals !== false,
      strategySellMinSignals: fs.strategySellMinSignals ?? 2,
      autoTrailingStop: fs.autoTrailingStop !== false,
      trailingStopPercent: fs.trailingStopPercent ?? 2,
      maxHoldDays: fs.maxHoldDays ?? 10,
      noProgressDays: fs.noProgressDays ?? 5,
      noProgressMinPct: fs.noProgressMinPct ?? 0.5,
      autoPauseEnabled: fs.autoPauseEnabled === true,
      autoPauseLookbackDays: fs.autoPauseLookbackDays ?? 14,
      autoPauseMaxLoss: fs.autoPauseMaxLoss ?? 5000,
    },
  };
}

function localToFirestore(s: AppSettings): Partial<FirestoreAppSettings> {
  const orderNotional = s.paperTrading.orderNotional ?? 100_000;
  return {
    defaultExchange: s.tradingPreferences.defaultExchange,
    defaultProduct: s.tradingPreferences.defaultProductType,
    defaultOrderType: s.tradingPreferences.defaultOrderType,
    maxOrderValue: Math.max(s.tradingPreferences.maxOrderValue ?? 0, orderNotional),
    maxDailyLoss: s.tradingPreferences.maxDailyLoss,
    paperStartingBalance: s.paperTrading.startingBalance,
    simulateBrokerage: s.paperTrading.simulateBrokerage,
    paperOrderNotional: s.paperTrading.orderNotional,
    paperDefaultProduct: s.paperTrading.defaultProductType,
    positionSizingMode: s.paperTrading.positionSizingMode,
    positionPct: s.paperTrading.positionPct,
    atrRiskPct: s.paperTrading.atrRiskPct,
    atrPeriod: s.paperTrading.atrPeriod,
    stopLossPercent: s.riskManagement.stopLossPercent,
    takeProfitPercent: s.riskManagement.takeProfitPercent,
    autoStopLoss: s.riskManagement.autoStopLoss,
    autoTakeProfit: s.riskManagement.autoTakeProfit,
    maxPositions: s.riskManagement.maxPositions,
    squareOffTime: s.riskManagement.squareOffTime,
    rebuyCooldownMinutes: s.riskManagement.rebuyCooldownMinutes,
    maxRoundTripsPerSymbolPerDay: s.riskManagement.maxRoundTripsPerSymbolPerDay,
    noSameDayRebuyAfterSell: s.riskManagement.noSameDayRebuyAfterSell,
    minHoldMinutesBeforeSell: s.riskManagement.minHoldMinutesBeforeSell,
    enableStrategySellSignals: s.riskManagement.enableStrategySellSignals,
    strategySellMinSignals: s.riskManagement.strategySellMinSignals,
    autoTrailingStop: s.riskManagement.autoTrailingStop,
    trailingStopPercent: s.riskManagement.trailingStopPercent,
    maxHoldDays: s.riskManagement.maxHoldDays,
    noProgressDays: s.riskManagement.noProgressDays,
    noProgressMinPct: s.riskManagement.noProgressMinPct,
    autoPauseEnabled: s.riskManagement.autoPauseEnabled,
    autoPauseLookbackDays: s.riskManagement.autoPauseLookbackDays,
    autoPauseMaxLoss: s.riskManagement.autoPauseMaxLoss,
    notifyOrders: s.notifications.orderExecution,
    notifyEmailDigest: s.notifications.emailDigest,
    notifySkipped: s.notifications.skippedOrders,
    notifyRiskExits: s.notifications.riskExits,
    notifySignals: s.notifications.strategySignals,
    notifyPnl: s.notifications.pnlAlerts,
  };
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Multi-account state
  const [accounts, setAccounts] = useState<(ZerodhaAccount & { connected: boolean })[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [disconnectingAccount, setDisconnectingAccount] = useState<string | null>(null);
  const [accountFunds, setAccountFunds] = useState<Record<string, { available: number; used: number; net: number }>>({});

  // Available Kite Connect app credentials
  const [availableApps, setAvailableApps] = useState<{ index: number; label: string; apiKeyPrefix: string }[]>([]);

  useEffect(() => {
    if (!user) return;

    setSettings(firestoreToLocal(loadFlatSettingsCache()));

    async function loadFromFirestore() {
      try {
        const fs = await getFirestoreSettings();
        const mapped = firestoreToLocal(fs);
        setSettings(mapped);
        saveSettingsToCache(fs);
      } catch (e) {
        console.error("Failed to load settings from Firestore, using cache:", e);
      }
    }

    async function loadCredentials() {
      try {
        const res = await fetch("/api/zerodha/credentials");
        const data = await res.json();
        setAvailableApps(data.credentials || []);
      } catch { /* ignore */ }
    }

    loadFromFirestore();
    loadAccounts();
    loadCredentials();
  }, [user]);

  // Handle new account added via OAuth redirect
  useEffect(() => {
    const newAccountId = searchParams.get("account_added");
    if (newAccountId) {
      handleNewAccountAdded(newAccountId);
      // Clean up URL
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchParams]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function handleNewAccountAdded(kiteUserId: string) {
    try {
      const res = await fetch(`/api/zerodha/status?accountId=${kiteUserId}`);
      const data = await res.json();

      if (data.connected) {
        const existingAccounts = await getZerodhaAccounts();
        const isExisting = existingAccounts.some((a) => a.kiteUserId === (data.userId || kiteUserId));

        await saveZerodhaAccount({
          kiteUserId: data.userId || kiteUserId,
          userName: data.userName || "",
          email: data.email || "",
          broker: data.broker || "",
          connectedAt: new Date().toISOString(),
        });

        if (isExisting) {
          setToast(`Account ${data.userName || kiteUserId} reconnected! To add a different account, log out of kite.zerodha.com first.`);
        } else {
          setToast(`New account ${data.userName || kiteUserId} added successfully!`);
        }
        await loadAccounts();
      } else {
        setToast("Connection failed. Please try again.");
      }
    } catch (e) {
      console.error("Error saving new account:", e);
      setToast("Account connected but failed to save metadata.");
    }
  }

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      // Load from Firestore (persistent metadata)
      const firestoreAccounts = await getZerodhaAccounts();

      // Check which ones have active sessions (cookies)
      const res = await fetch("/api/zerodha/accounts");
      const data = await res.json();
      const serverAccounts: ServerAccount[] = data.accounts || [];

      const serverMap = new Map(serverAccounts.map((a) => [a.kiteUserId, a]));

      // Merge: Firestore has metadata, server has connection status
      const merged = firestoreAccounts.map((fa) => ({
        ...fa,
        connected: serverMap.has(fa.kiteUserId),
        userName: serverMap.get(fa.kiteUserId)?.userName || fa.userName,
        email: serverMap.get(fa.kiteUserId)?.email || fa.email,
      }));

      // Add any server accounts not in Firestore (legacy)
      for (const sa of serverAccounts) {
        if (!firestoreAccounts.find((fa) => fa.kiteUserId === sa.kiteUserId)) {
          merged.push({
            kiteUserId: sa.kiteUserId,
            userName: sa.userName || "",
            email: sa.email || "",
            broker: sa.broker || "",
            connectedAt: new Date().toISOString(),
            connected: true,
          });
          // Save to Firestore for persistence
          await saveZerodhaAccount({
            kiteUserId: sa.kiteUserId,
            userName: sa.userName || "",
            email: sa.email || "",
            broker: sa.broker || "",
            connectedAt: new Date().toISOString(),
          });
        }
      }

      setAccounts(merged);

      const connectedIds = merged.filter((a) => a.connected).map((a) => a.kiteUserId);
      if (connectedIds.length > 0) {
        const fundResults = await Promise.all(
          connectedIds.map(async (id) => {
            try {
              const mRes = await fetch(`/api/zerodha/margins?accountId=${id}`);
              if (!mRes.ok) return null;
              const mData = await mRes.json();
              return { id, available: mData.available ?? 0, used: mData.used ?? 0, net: mData.net ?? 0 };
            } catch {
              return null;
            }
          })
        );
        const fundsMap: Record<string, { available: number; used: number; net: number }> = {};
        for (const f of fundResults) {
          if (f) fundsMap[f.id] = { available: f.available, used: f.used, net: f.net };
        }
        setAccountFunds(fundsMap);
      }
    } catch (e) {
      console.error("Error loading accounts:", e);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function handleDisconnect(kiteUserId: string) {
    setDisconnectingAccount(kiteUserId);
    try {
      await fetch("/api/zerodha/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: kiteUserId }),
      });
      setAccounts((prev) =>
        prev.map((a) => (a.kiteUserId === kiteUserId ? { ...a, connected: false } : a))
      );
      setToast(`Account ${kiteUserId} disconnected.`);
    } catch {
      setToast("Failed to disconnect account.");
    } finally {
      setDisconnectingAccount(null);
    }
  }

  async function handleRemoveAccount(kiteUserId: string) {
    if (!window.confirm(`Remove account ${kiteUserId}? This will disconnect and remove it from your list.`)) return;
    try {
      await fetch("/api/zerodha/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: kiteUserId }),
      });
      await removeZerodhaAccount(kiteUserId);
      setAccounts((prev) => prev.filter((a) => a.kiteUserId !== kiteUserId));
      setToast(`Account ${kiteUserId} removed.`);
    } catch {
      setToast("Failed to remove account.");
    }
  }

  async function handleSaveLabel(kiteUserId: string) {
    try {
      await updateZerodhaAccountLabel(kiteUserId, labelInput);
      setAccounts((prev) =>
        prev.map((a) => (a.kiteUserId === kiteUserId ? { ...a, label: labelInput } : a))
      );
      setEditingLabel(null);
      setLabelInput("");
    } catch {
      setToast("Failed to update label.");
    }
  }

  async function handleReconnect(kiteUserId: string) {
    window.location.href = "/api/zerodha/login";
  }

  async function handleSave() {
    if (!user) {
      setToastError(true);
      setToast("Sign in to save settings to the cloud.");
      return;
    }

    setSaving(true);
    setToastError(false);
    const flat = { ...DEFAULT_SETTINGS, ...localToFirestore(settings) };

    try {
      saveSettingsToCache(flat);
      await saveFirestoreSettings(localToFirestore(settings));
      const balanceResult = await applyPaperStartingBalanceIfFlat();
      if (balanceResult === "applied") {
        setToast(
          "Settings saved. Paper cash balance updated to your new starting amount (no open positions)."
        );
        window.dispatchEvent(new CustomEvent("paper-trading-updated"));
      } else if (balanceResult === "skipped_has_positions") {
        setToast(
          "Settings saved. Reset paper portfolio to apply a new starting balance while you have holdings."
        );
      } else {
        setToast("Settings saved successfully!");
      }
    } catch (e) {
      console.error("Failed to save settings to Firestore:", e);
      setToastError(true);
      const msg =
        e instanceof Error ? e.message : "Could not sync to cloud";
      setToast(
        `Saved on this device only. Cloud sync failed: ${msg}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetPaperPortfolio() {
    setResetLoading(true);
    setResetMessage(null);
    setToastError(false);
    try {
      await resetPaperTrading();
      localStorage.removeItem("paper_trading_state");
      localStorage.removeItem("paperTrades");
      setResetConfirm(false);
      const starting = settings.paperTrading.startingBalance;
      const msg = `Paper portfolio reset — balance ${formatCurrency(starting)}, orders cleared, scan locks cleared.`;
      setResetMessage({ ok: true, text: msg });
      setToast(msg);
      window.dispatchEvent(new CustomEvent("paper-trading-updated"));
      window.dispatchEvent(new CustomEvent("strategies-updated"));
    } catch (e) {
      const msg =
        e instanceof Error
          ? `Reset failed: ${e.message}`
          : "Reset failed — please try again.";
      setResetMessage({ ok: false, text: msg });
      setToastError(true);
      setToast(msg);
    } finally {
      setResetLoading(false);
    }
  }

  function updateSettings<K extends keyof AppSettings>(
    section: K,
    updates: Partial<AppSettings[K]>
  ) {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
  }

  const connectedCount = accounts.filter((a) => a.connected).length;

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Configure your trading preferences &amp; connections
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className={cn("h-4 w-4", saving && "animate-pulse")} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      {/* ── Zerodha Accounts ──────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent-muted p-2">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Zerodha Accounts
              </h2>
              <p className="text-xs text-text-secondary">
                Manage multiple Kite accounts for live trading
              </p>
            </div>
          </div>
          {availableApps.length <= 1 ? (
            <a
              href="/api/zerodha/login"
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-accent-hover cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Account
            </a>
          ) : (
            <div className="flex items-center gap-2">
              {availableApps.map((app) => (
                <a
                  key={app.index}
                  href={`/api/zerodha/login?credIndex=${app.index}`}
                  className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-brand transition-colors hover:bg-accent-hover cursor-pointer"
                  title={`API Key: ${app.apiKeyPrefix}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {app.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 mb-4">
          <p className="text-xs text-amber-200/90">
            <strong>Add funds:</strong> Zerodha does not allow adding money through third-party apps.
            Deposit via{" "}
            <a
              href="https://kite.zerodha.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline hover:text-amber-200"
            >
              Kite web
            </a>{" "}
            or the Zerodha mobile app (Funds → Add funds). Available balance shown here updates after you connect.
          </p>
        </div>

        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 mb-4">
          <p className="text-xs text-blue-300">
            <strong>Adding a new account?</strong>
            {availableApps.length > 1
              ? " Select the Kite Connect app that matches the account you want to add. Each account needs its own app."
              : " You\u2019ll be redirected to Zerodha\u2019s login page."
            }
            {" "}Log in with the Zerodha credentials of the account you want to add.
            If it keeps connecting the same account, first log out at{" "}
            <a href="https://kite.zerodha.com" target="_blank" rel="noopener noreferrer" className="underline">
              kite.zerodha.com
            </a>{" "}
            and then try again.
          </p>
        </div>

        {loadingAccounts ? (
          <div className="flex items-center gap-2 text-text-tertiary text-sm py-8 justify-center">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-10">
            <Users className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm text-text-secondary mb-1">No Zerodha accounts connected</p>
            <p className="text-xs text-text-tertiary mb-4">
              Connect your Zerodha accounts to start live trading
            </p>
            {availableApps.length <= 1 ? (
              <a
                href="/api/zerodha/login"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-accent-hover cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Connect Zerodha Account
              </a>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {availableApps.map((app) => (
                  <a
                    key={app.index}
                    href={`/api/zerodha/login?credIndex=${app.index}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-accent-hover cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    {app.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center gap-3 rounded-lg bg-bg-tertiary px-4 py-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {accounts.length} account{accounts.length !== 1 ? "s" : ""}
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <span className={cn("h-2 w-2 rounded-full", connectedCount > 0 ? "bg-profit" : "bg-text-tertiary")} />
                  <span className={cn("font-medium", connectedCount > 0 ? "text-profit" : "text-text-tertiary")}>
                    {connectedCount} active
                  </span>
                </span>
              </div>
              <p className="ml-auto text-xs text-text-tertiary">
                Tokens expire daily — reconnect each morning
              </p>
            </div>

            {/* Account Cards */}
            {accounts.map((account) => (
              <div
                key={account.kiteUserId}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  account.connected
                    ? "border-profit/30 bg-profit-muted/10"
                    : "border-border bg-bg-tertiary"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold",
                        account.connected
                          ? "bg-profit/20 text-profit"
                          : "bg-bg-hover text-text-tertiary"
                      )}
                    >
                      {account.userName?.[0]?.toUpperCase() || account.kiteUserId[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {editingLabel === account.kiteUserId ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={labelInput}
                              onChange={(e) => setLabelInput(e.target.value)}
                              placeholder="e.g. Personal, Family, Client"
                              className="rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none w-40"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveLabel(account.kiteUserId);
                                if (e.key === "Escape") { setEditingLabel(null); setLabelInput(""); }
                              }}
                            />
                            <button
                              onClick={() => handleSaveLabel(account.kiteUserId)}
                              className="text-profit hover:text-profit/80"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => { setEditingLabel(null); setLabelInput(""); }}
                              className="text-text-tertiary hover:text-text-secondary"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-text-primary">
                              {account.label || account.userName || account.kiteUserId}
                            </p>
                            <button
                              onClick={() => {
                                setEditingLabel(account.kiteUserId);
                                setLabelInput(account.label || "");
                              }}
                              className="text-text-tertiary hover:text-text-secondary"
                              title="Edit label"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-text-tertiary font-mono">
                          {account.kiteUserId}
                        </span>
                        {account.email && (
                          <>
                            <span className="text-text-tertiary">·</span>
                            <span className="text-xs text-text-tertiary">
                              {account.email}
                            </span>
                          </>
                        )}
                      </div>
                      {account.connected && accountFunds[account.kiteUserId] && (
                        <div className="mt-2 flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-profit">
                            <Wallet className="h-3 w-3" />
                            Available {formatCurrency(accountFunds[account.kiteUserId].available)}
                          </span>
                          {accountFunds[account.kiteUserId].used > 0 && (
                            <span className="text-text-tertiary">
                              Used {formatCurrency(accountFunds[account.kiteUserId].used)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {account.connected ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-profit-muted px-2.5 py-1 text-xs font-medium text-profit">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-full bg-loss-muted px-2.5 py-1 text-xs font-medium text-loss">
                        <XCircle className="h-3 w-3" />
                        Expired
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  {account.connected ? (
                    <button
                      onClick={() => handleDisconnect(account.kiteUserId)}
                      disabled={disconnectingAccount === account.kiteUserId}
                      className="flex items-center gap-1.5 rounded-md bg-loss-muted px-3 py-1.5 text-xs font-medium text-loss transition-colors hover:bg-loss/20 disabled:opacity-50"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {disconnectingAccount === account.kiteUserId ? "Disconnecting..." : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReconnect(account.kiteUserId)}
                      className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-accent-hover"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reconnect
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveAccount(account.kiteUserId)}
                    className="flex items-center gap-1.5 rounded-md bg-bg-hover px-3 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:bg-loss-muted hover:text-loss"
                    title="Remove account"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary/50 p-3 mt-2">
              <ShieldCheck className="h-4 w-4 text-text-tertiary shrink-0" />
              <p className="text-xs text-text-tertiary">
                Access tokens are stored as secure httpOnly cookies and expire every 24 hours.
                Account metadata is saved to your profile for persistence.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Paper Trading Settings ──────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-accent-muted p-2">
            <Wallet className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Paper Trading
            </h2>
            <p className="text-xs text-text-secondary">
              Used by Paper Trading and strategy auto-trades (delivery CNC by default)
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Starting Balance (₹)
              </label>
              <input
                type="number"
                value={settings.paperTrading.startingBalance}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    startingBalance: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-[10px] text-text-tertiary">
                Applied when you save (if no holdings) or when you reset paper portfolio.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Order size per trade (₹)
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={settings.paperTrading.orderNotional}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    orderNotional: Math.max(1000, Number(e.target.value) || 100_000),
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-[10px] text-text-tertiary">
                Used when sizing mode is Fixed rupee (₹) notional.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Position sizing mode
              </label>
              <select
                value={settings.paperTrading.positionSizingMode}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    positionSizingMode: e.target.value as
                      | "notional"
                      | "portfolio_pct"
                      | "atr_risk",
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="notional">Fixed ₹ notional</option>
                <option value="portfolio_pct">% of paper balance</option>
                <option value="atr_risk">ATR risk (volatility)</option>
              </select>
            </div>
            {settings.paperTrading.positionSizingMode === "portfolio_pct" && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  % of balance per BUY
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={settings.paperTrading.positionPct}
                  onChange={(e) =>
                    updateSettings("paperTrading", {
                      positionPct: Math.max(0.5, Number(e.target.value) || 10),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            )}
            {settings.paperTrading.positionSizingMode === "atr_risk" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Risk % of balance per ATR
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={settings.paperTrading.atrRiskPct}
                    onChange={(e) =>
                      updateSettings("paperTrading", {
                        atrRiskPct: Math.max(0.1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    ATR period (bars)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={settings.paperTrading.atrPeriod}
                    onChange={(e) =>
                      updateSettings("paperTrading", {
                        atrPeriod: Math.max(5, Number(e.target.value) || 14),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Paper Product Type
              </label>
              <select
                value={settings.paperTrading.defaultProductType}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    defaultProductType: e.target.value as "CNC" | "MIS",
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="CNC">CNC (Delivery) — recommended</option>
                <option value="MIS">MIS (Intraday) — auto square-off at risk time</option>
              </select>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={settings.paperTrading.simulateBrokerage}
                  onChange={(e) =>
                    updateSettings("paperTrading", {
                      simulateBrokerage: e.target.checked,
                    })
                  }
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Simulate Brokerage
                </p>
                <p className="text-xs text-text-tertiary">
                  Deduct realistic brokerage charges
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            {!resetConfirm ? (
              <button
                onClick={() => {
                  setResetMessage(null);
                  setResetConfirm(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-loss-muted px-4 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss/20"
              >
                <RefreshCw className="h-4 w-4" />
                Reset Paper Portfolio
              </button>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  This will delete all paper trades and orders. Are you sure?
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void resetPaperPortfolio()}
                    disabled={resetLoading}
                    className="rounded-lg bg-loss px-3 py-1.5 text-xs font-medium text-white hover:bg-loss/80 disabled:opacity-60"
                  >
                    {resetLoading ? "Resetting…" : "Confirm Reset"}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    disabled={resetLoading}
                    className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {resetMessage && (
              <p
                role="status"
                className={cn(
                  "text-sm rounded-lg px-3 py-2",
                  resetMessage.ok
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-loss-muted text-loss"
                )}
              >
                {resetMessage.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Trading Preferences ─────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-accent-muted p-2">
            <TrendingUp className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Trading Preferences
            </h2>
            <p className="text-xs text-text-secondary">
              Defaults for Live Trading (Zerodha orders only)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Default Exchange
            </label>
            <select
              value={settings.tradingPreferences.defaultExchange}
              onChange={(e) =>
                updateSettings("tradingPreferences", {
                  defaultExchange: e.target.value as "NSE" | "BSE",
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Default Product Type
            </label>
            <select
              value={settings.tradingPreferences.defaultProductType}
              onChange={(e) =>
                updateSettings("tradingPreferences", {
                  defaultProductType: e.target.value as "MIS" | "CNC" | "NRML",
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="MIS">MIS (Intraday)</option>
              <option value="CNC">CNC (Delivery)</option>
              <option value="NRML">NRML (F&amp;O)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Default Order Type
            </label>
            <select
              value={settings.tradingPreferences.defaultOrderType}
              onChange={(e) =>
                updateSettings("tradingPreferences", {
                  defaultOrderType: e.target.value as "MARKET" | "LIMIT",
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Max Order Value (₹)
            </label>
            <input
              type="number"
              value={settings.tradingPreferences.maxOrderValue}
              onChange={(e) =>
                updateSettings("tradingPreferences", {
                  maxOrderValue: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Max Daily Loss (₹)
            </label>
            <input
              type="number"
              value={settings.tradingPreferences.maxDailyLoss}
              onChange={(e) =>
                updateSettings("tradingPreferences", {
                  maxDailyLoss: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </section>

      {/* ── Notifications ───────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-accent-muted p-2">
            <Bell className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Notifications
            </h2>
            <p className="text-xs text-text-secondary">
              Strategy scans send at most one summary email per 15 min when digest is on
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            {
              key: "orderExecution" as const,
              label: "Trade emails",
              desc: "Enable email notifications for trades (required for digest)",
            },
            {
              key: "emailDigest" as const,
              label: "One email per scan (recommended)",
              desc: "Single summary per 15-min strategy run instead of one email per stock",
            },
            {
              key: "riskExits" as const,
              label: "Stop-loss / take-profit exits",
              desc: "Include auto risk sells in emails",
            },
            {
              key: "skippedOrders" as const,
              label: "Skipped orders (noisy)",
              desc: "Email when a strategy signal could not run (e.g. low balance)",
            },
            {
              key: "strategySignals" as const,
              label: "Live strategy signals only",
              desc: "Email for live-mode signals that need manual placement (off by default)",
            },
            {
              key: "pnlAlerts" as const,
              label: "Daily P&L email",
              desc: "End-of-day paper portfolio summary after market close (15:35 IST)",
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg bg-bg-tertiary p-4"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {item.label}
                </p>
                <p className="text-xs text-text-tertiary">{item.desc}</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={settings.notifications[item.key]}
                  onChange={(e) =>
                    updateSettings("notifications", {
                      [item.key]: e.target.checked,
                    })
                  }
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-bg-hover peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* ── Risk Management ─────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-accent-muted p-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Risk Management
            </h2>
            <p className="text-xs text-text-secondary">
              Stop-loss on losses; trailing stop after min profit; time exits for stale positions
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {[
            {
              key: "autoStopLoss" as const,
              label: "Auto Stop Loss",
              desc: `Sell when loss reaches ${settings.riskManagement.stopLossPercent}%`,
            },
            {
              key: "autoTakeProfit" as const,
              label: "Auto Take Profit (fixed exit)",
              desc: `Optional: sell immediately at min profit ${settings.riskManagement.takeProfitPercent}% — off = strategy sells + trailing only`,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg bg-bg-tertiary p-4"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{item.label}</p>
                <p className="text-xs text-text-tertiary">{item.desc}</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={settings.riskManagement[item.key]}
                  onChange={(e) =>
                    updateSettings("riskManagement", {
                      [item.key]: e.target.checked,
                    })
                  }
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-bg-hover peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Stop Loss (%)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={settings.riskManagement.stopLossPercent}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  stopLossPercent: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Min profit % (strategy sells &amp; trailing arm)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={settings.riskManagement.takeProfitPercent}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  takeProfitPercent: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Max Positions
            </label>
            <input
              type="number"
              min="1"
              value={settings.riskManagement.maxPositions}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  maxPositions: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              MIS Square Off Time
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                type="time"
                value={settings.riskManagement.squareOffTime}
                onChange={(e) =>
                  updateSettings("riskManagement", {
                    squareOffTime: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary pl-9 pr-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Rebuy Cooldown (minutes)
            </label>
            <input
              type="number"
              min="0"
              step="15"
              value={settings.riskManagement.rebuyCooldownMinutes}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  rebuyCooldownMinutes: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              After a sell, same symbol cannot be bought again for this long (default 240 = 4h).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Max Round-Trips / Symbol / Day
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={settings.riskManagement.maxRoundTripsPerSymbolPerDay}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  maxRoundTripsPerSymbolPerDay: Math.max(
                    1,
                    Number(e.target.value) || 1
                  ),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Limits buy→sell cycles per symbol per day (stops SAIL-style whipsaw).
            </p>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.riskManagement.noSameDayRebuyAfterSell}
                onChange={(e) =>
                  updateSettings("riskManagement", {
                    noSameDayRebuyAfterSell: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">
                No same-day rebuy after sell
              </p>
              <p className="text-xs text-text-tertiary">
                After SAIL / Policybazaar is sold once today, strategies cannot buy it again until tomorrow.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.riskManagement.enableStrategySellSignals}
                onChange={(e) =>
                  updateSettings("riskManagement", {
                    enableStrategySellSignals: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">
                Strategy SELL signals (paper)
              </p>
              <p className="text-xs text-text-tertiary">
                Buys run first each scan. Sells only on held positions after min-hold and min profit %.
                Weak single-signal sells are ignored — trailing stop protects gains until more strategies agree.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Min Hold Before Strategy Sell (minutes)
            </label>
            <input
              type="number"
              min="0"
              step="15"
              value={settings.riskManagement.minHoldMinutesBeforeSell}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  minHoldMinutesBeforeSell: Math.max(
                    0,
                    Number(e.target.value) || 0
                  ),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Stop-loss and trailing exits are not affected.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Min strategy sell signals
            </label>
            <input
              type="number"
              min="1"
              max="12"
              value={settings.riskManagement.strategySellMinSignals}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  strategySellMinSignals: Math.max(
                    1,
                    Number(e.target.value) || 1
                  ),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Symbols need this many strategy SELL signals (after min profit) before exiting.
            </p>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.riskManagement.autoTrailingStop}
                onChange={(e) =>
                  updateSettings("riskManagement", {
                    autoTrailingStop: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">Trailing stop-loss</p>
              <p className="text-xs text-text-tertiary">
                After min profit %, exit when price falls this % from the peak (ratchets up as price rises).
              </p>
            </div>
          </div>

          {settings.riskManagement.autoTrailingStop && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Trailing stop (%)
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={settings.riskManagement.trailingStopPercent}
                onChange={(e) =>
                  updateSettings("riskManagement", {
                    trailingStopPercent: Math.max(0.5, Number(e.target.value) || 2),
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Max hold (days, 0 = off)
            </label>
            <input
              type="number"
              min={0}
              value={settings.riskManagement.maxHoldDays}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  maxHoldDays: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              No-progress exit (days, 0 = off)
            </label>
            <input
              type="number"
              min={0}
              value={settings.riskManagement.noProgressDays}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  noProgressDays: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Closes if held N days without reaching min gain below.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              No-progress min gain (%)
            </label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={settings.riskManagement.noProgressMinPct}
              onChange={(e) =>
                updateSettings("riskManagement", {
                  noProgressMinPct: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.riskManagement.autoPauseEnabled}
                onChange={(e) =>
                  updateSettings("riskManagement", {
                    autoPauseEnabled: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">Auto-pause losing strategies</p>
              <p className="text-xs text-text-tertiary">
                Pauses strategy instances after rolling realized loss exceeds limit.
              </p>
            </div>
          </div>

          {settings.riskManagement.autoPauseEnabled && (
            <>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Lookback (days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.riskManagement.autoPauseLookbackDays}
                  onChange={(e) =>
                    updateSettings("riskManagement", {
                      autoPauseLookbackDays: Math.max(1, Number(e.target.value) || 14),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Max loss (₹) before pause
                </label>
                <input
                  type="number"
                  min={100}
                  step={500}
                  value={settings.riskManagement.autoPauseMaxLoss}
                  onChange={(e) =>
                    updateSettings("riskManagement", {
                      autoPauseMaxLoss: Math.max(100, Number(e.target.value) || 5000),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[100] flex items-center gap-2 rounded-lg border px-4 py-3 shadow-xl",
            toastError
              ? "border-loss/40 bg-loss-muted"
              : "border-border bg-bg-elevated"
          )}
        >
          {toastError ? (
            <AlertTriangle className="h-4 w-4 text-loss shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-profit shrink-0" />
          )}
          <span className="text-sm text-text-primary">{toast}</span>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
