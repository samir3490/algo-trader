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
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getSettings as getFirestoreSettings,
  saveSettings as saveFirestoreSettings,
  type AppSettings as FirestoreAppSettings,
  getZerodhaAccounts,
  saveZerodhaAccount,
  removeZerodhaAccount,
  updateZerodhaAccountLabel,
  type ZerodhaAccount,
} from "@/lib/firebase";

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
    strategySignals: boolean;
    pnlAlerts: boolean;
  };
  riskManagement: {
    stopLossPercent: number;
    takeProfitPercent: number;
    maxPositions: number;
    squareOffTime: string;
  };
}

const defaultSettings: AppSettings = {
  paperTrading: {
    startingBalance: 1000000,
    simulateBrokerage: true,
  },
  tradingPreferences: {
    defaultExchange: "NSE",
    defaultProductType: "MIS",
    defaultOrderType: "MARKET",
    maxOrderValue: 500000,
    maxDailyLoss: 50000,
  },
  notifications: {
    orderExecution: true,
    strategySignals: true,
    pnlAlerts: false,
  },
  riskManagement: {
    stopLossPercent: 2,
    takeProfitPercent: 5,
    maxPositions: 5,
    squareOffTime: "15:15",
  },
};

function loadSettingsFromCache(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const saved = localStorage.getItem("algotrader_settings");
    if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
  } catch {}
  return defaultSettings;
}

function firestoreToLocal(fs: FirestoreAppSettings): AppSettings {
  return {
    paperTrading: {
      startingBalance: fs.paperStartingBalance,
      simulateBrokerage: fs.simulateBrokerage,
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
      strategySignals: fs.notifySignals,
      pnlAlerts: fs.notifyPnl,
    },
    riskManagement: {
      stopLossPercent: fs.stopLossPercent,
      takeProfitPercent: fs.takeProfitPercent,
      maxPositions: fs.maxPositions,
      squareOffTime: fs.squareOffTime,
    },
  };
}

function localToFirestore(s: AppSettings): Partial<FirestoreAppSettings> {
  return {
    defaultExchange: s.tradingPreferences.defaultExchange,
    defaultProduct: s.tradingPreferences.defaultProductType,
    defaultOrderType: s.tradingPreferences.defaultOrderType,
    maxOrderValue: s.tradingPreferences.maxOrderValue,
    maxDailyLoss: s.tradingPreferences.maxDailyLoss,
    paperStartingBalance: s.paperTrading.startingBalance,
    simulateBrokerage: s.paperTrading.simulateBrokerage,
    stopLossPercent: s.riskManagement.stopLossPercent,
    takeProfitPercent: s.riskManagement.takeProfitPercent,
    maxPositions: s.riskManagement.maxPositions,
    squareOffTime: s.riskManagement.squareOffTime,
    notifyOrders: s.notifications.orderExecution,
    notifySignals: s.notifications.strategySignals,
    notifyPnl: s.notifications.pnlAlerts,
  };
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Multi-account state
  const [accounts, setAccounts] = useState<(ZerodhaAccount & { connected: boolean })[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [disconnectingAccount, setDisconnectingAccount] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    setSettings(loadSettingsFromCache());

    async function loadFromFirestore() {
      try {
        const fs = await getFirestoreSettings();
        const mapped = firestoreToLocal(fs);
        setSettings(mapped);
        localStorage.setItem("algotrader_settings", JSON.stringify(mapped));
      } catch (e) {
        console.error("Failed to load settings from Firestore, using cache:", e);
      }
    }

    loadFromFirestore();
    loadAccounts();
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
    localStorage.setItem("algotrader_settings", JSON.stringify(settings));
    try {
      await saveFirestoreSettings(localToFirestore(settings));
      setToast("Settings saved successfully!");
    } catch (e) {
      console.error("Failed to save settings to Firestore:", e);
      setToast("Settings saved locally (cloud sync failed).");
    }
  }

  function resetPaperPortfolio() {
    localStorage.removeItem("paper_portfolio");
    localStorage.removeItem("paper_orders");
    localStorage.removeItem("paper_positions");
    setResetConfirm(false);
    setToast("Paper portfolio has been reset.");
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
          onClick={handleSave}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Save className="h-4 w-4" />
          Save Settings
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
          <a
            href="/api/zerodha/login"
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </a>
        </div>

        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 mb-4">
          <p className="text-xs text-blue-300">
            <strong>Adding a new account?</strong> You&apos;ll be redirected to Zerodha&apos;s login page.
            Log in with the Zerodha credentials of the account you want to add.
            If it keeps connecting the same account, first log out at{" "}
            <a href="https://kite.zerodha.com" target="_blank" rel="noopener noreferrer" className="underline">
              kite.zerodha.com
            </a>{" "}
            and then click Add Account.
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
            <a
              href="/api/zerodha/login"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Connect Zerodha Account
            </a>
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
                      className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
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
              Simulated trading environment settings
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
            </div>
            <div className="flex items-center gap-3">
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

          <div className="border-t border-border pt-4">
            {!resetConfirm ? (
              <button
                onClick={() => setResetConfirm(true)}
                className="flex items-center gap-2 rounded-lg bg-loss-muted px-4 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss/20"
              >
                <RefreshCw className="h-4 w-4" />
                Reset Paper Portfolio
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  This will delete all paper trades. Are you sure?
                </div>
                <button
                  onClick={resetPaperPortfolio}
                  className="rounded-lg bg-loss px-3 py-1.5 text-xs font-medium text-white hover:bg-loss/80"
                >
                  Confirm Reset
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover"
                >
                  Cancel
                </button>
              </div>
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
              Default values for order placement
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
              Configure alert preferences
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            {
              key: "orderExecution" as const,
              label: "Order Execution Alerts",
              desc: "Notify when orders are placed or filled",
            },
            {
              key: "strategySignals" as const,
              label: "Strategy Signal Alerts",
              desc: "Notify when strategies generate buy/sell signals",
            },
            {
              key: "pnlAlerts" as const,
              label: "P&L Alerts",
              desc: "Notify on significant profit or loss thresholds",
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
              Automatic safeguards for your trades
            </p>
          </div>
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
              Take Profit (%)
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
        </div>
      </section>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-3 shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300">
          <CheckCircle2 className="h-4 w-4 text-profit" />
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
