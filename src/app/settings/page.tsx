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
    defaultQuantity: number;
    defaultProductType: "CNC" | "MIS";
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
  };
}

const defaultSettings: AppSettings = {
  paperTrading: {
    startingBalance: 1000000,
    simulateBrokerage: true,
    defaultQuantity: 1,
    defaultProductType: "CNC",
  },
  tradingPreferences: {
    defaultExchange: "NSE",
    defaultProductType: "CNC",
    defaultOrderType: "MARKET",
    maxOrderValue: 500000,
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
    autoTakeProfit: true,
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
      defaultQuantity: fs.defaultQuantity ?? 1,
      defaultProductType: (fs.paperDefaultProduct as "CNC" | "MIS") ?? "CNC",
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
    defaultQuantity: s.paperTrading.defaultQuantity,
    paperDefaultProduct: s.paperTrading.defaultProductType,
    stopLossPercent: s.riskManagement.stopLossPercent,
    takeProfitPercent: s.riskManagement.takeProfitPercent,
    autoStopLoss: s.riskManagement.autoStopLoss,
    autoTakeProfit: s.riskManagement.autoTakeProfit,
    maxPositions: s.riskManagement.maxPositions,
    squareOffTime: s.riskManagement.squareOffTime,
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
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

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
          {availableApps.length <= 1 ? (
            <a
              href="/api/zerodha/login"
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
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
                  className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
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
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
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
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
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
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Default Quantity (shares)
              </label>
              <input
                type="number"
                min={1}
                value={settings.paperTrading.defaultQuantity}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    defaultQuantity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
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
              Auto stop-loss / take-profit on paper holdings (checked every minute)
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
              label: "Auto Take Profit",
              desc: `Sell when profit reaches ${settings.riskManagement.takeProfitPercent}%`,
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
