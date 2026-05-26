"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSettings as getFirestoreSettings,
  saveSettings as saveFirestoreSettings,
  type AppSettings as FirestoreAppSettings,
} from "@/lib/firebase";

interface ZerodhaStatus {
  connected: boolean;
  userId?: string;
  userName?: string;
  email?: string;
  broker?: string;
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [zerodhaStatus, setZerodhaStatus] = useState<ZerodhaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
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
    fetchZerodhaStatus();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchZerodhaStatus() {
    try {
      const res = await fetch("/api/zerodha/status");
      const data = await res.json();
      setZerodhaStatus(data);
    } catch {
      setZerodhaStatus({ connected: false });
    } finally {
      setLoading(false);
    }
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

  async function handleConnect() {
    window.location.href = "/api/zerodha/login";
  }

  async function handleDisconnect() {
    try {
      await fetch("/api/zerodha/logout", { method: "POST" });
      setZerodhaStatus({ connected: false });
      setToast("Disconnected from Zerodha.");
    } catch {
      setToast("Failed to disconnect.");
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* ── Zerodha Connection ──────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-accent-muted p-2">
            <Link2 className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Zerodha Connection
            </h2>
            <p className="text-xs text-text-secondary">
              Connect your Kite account for live trading
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-tertiary text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Checking connection...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {zerodhaStatus?.connected ? (
                <span className="flex items-center gap-2 rounded-full bg-profit-muted px-3 py-1 text-xs font-medium text-profit">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-2 rounded-full bg-loss-muted px-3 py-1 text-xs font-medium text-loss">
                  <XCircle className="h-3.5 w-3.5" />
                  Disconnected
                </span>
              )}
            </div>

            {zerodhaStatus?.connected && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg bg-bg-tertiary p-4">
                <div>
                  <p className="text-xs text-text-tertiary">User ID</p>
                  <p className="text-sm font-medium text-text-primary">
                    {zerodhaStatus.userId || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Name</p>
                  <p className="text-sm font-medium text-text-primary">
                    {zerodhaStatus.userName || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Email</p>
                  <p className="text-sm font-medium text-text-primary">
                    {zerodhaStatus.email || "—"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-lg bg-bg-tertiary p-4">
              <ShieldCheck className="h-4 w-4 text-text-tertiary" />
              <div>
                <p className="text-xs text-text-tertiary">KITE API Key</p>
                <p className="text-sm font-medium text-text-primary">
                  {process.env.NEXT_PUBLIC_KITE_API_KEY_CONFIGURED === "true"
                    ? "✓ Configured"
                    : "Configured (server-side)"}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              {zerodhaStatus?.connected ? (
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 rounded-lg bg-loss-muted px-4 py-2 text-sm font-medium text-loss transition-colors hover:bg-loss/20"
                >
                  <Power className="h-4 w-4" />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  <Power className="h-4 w-4" />
                  Connect to Zerodha
                </button>
              )}
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
