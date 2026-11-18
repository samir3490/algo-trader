"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Settings as SettingsIcon,
  Link2,
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
  ListChecks,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { PAPER_RULE_CATALOG, type PaperRuleKey } from "@/lib/settings/paper-rules";
import {
  LIVE_RULE_CATALOG,
  type LiveRuleKey,
} from "@/lib/settings/live-rules";
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
import { effectivePositionSizingMode } from "@/lib/settings/normalize-settings";
import LiveAutoSwitch from "@/components/live-trading/live-auto-switch";
import PageHeader from "@/components/ui/page-header";
import { useOptionalToast } from "@/components/ui/toast";

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
    /** Hard cap per paper BUY (default ₹5,00,000). */
    maxPerTrade: number;
    /** Minimum rupee turnover per paper BUY (default ₹25,000). */
    minPerTrade: number;
    defaultProductType: "CNC" | "MIS";
    positionSizingMode: "notional" | "portfolio_pct" | "atr_risk";
    positionPct: number;
    atrRiskPct: number;
    atrPeriod: number;
    atrStopMultiplier: number;
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
    weeklyShortlist: boolean;
  };
  /** Checklist of paper rules — Settings → Rules. */
  paperRules: {
    fixedNotional1L: boolean;
    basicExits2and5: boolean;
    maxPositions25: boolean;
    strategySellsOff: boolean;
    clearRebuyLocks: boolean;
    preferStrongSectors: boolean;
    minBuySignals2: boolean;
    autoSeedUniverse: boolean;
    regimeWeighting: boolean;
    entryConnectedExits: boolean;
    weeklyShortlistEmail: boolean;
    emailDigest: boolean;
    riskExitEmails: boolean;
  };
  /** Checklist of live rules — Settings → Live Rules (independent copy of paper). */
  liveRules: {
    autoTradingEnabled: boolean;
    fixedOrderNotional: boolean;
    basicExits2and5: boolean;
    maxPositions10: boolean;
    strategySellsOff: boolean;
    clearRebuyLocks: boolean;
    preferStrongSectors: boolean;
    minBuySignals3: boolean;
    autoSeedUniverse: boolean;
    enforceCapitalLimits: boolean;
    regimeWeighting: boolean;
    entryConnectedExits: boolean;
    emailDigest: boolean;
    riskExitEmails: boolean;
    weeklyShortlistEmail: boolean;
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
  marketRegime: {
    enableRegimeWeighting: boolean;
    enableEntryConnectedExits: boolean;
    regimeAdxThreshold: number;
    momentumRsiOverbought: number;
  };
  /** Live auto-trading automation. When mirror is on, paper values apply. */
  liveTrading: {
    mirrorPaperAutomation: boolean;
    enableRegimeWeighting: boolean;
    enableEntryConnectedExits: boolean;
    regimeAdxThreshold: number;
    momentumRsiOverbought: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    maxPositions: number;
    enableStrategySellSignals: boolean;
    strategySellMinSignals: number;
    autoTrailingStop: boolean;
    trailingStopPercent: number;
    minHoldMinutesBeforeSell: number;
    /** Max ₹ for one live BUY. */
    orderNotional: number;
    /** Max ₹ total the live algo may deploy. */
    capitalLimit: number;
  };
}

type SettingsTab = "paper" | "live" | "general" | "rules" | "live-rules";

function SettingsTabBar({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  const tabs: { id: SettingsTab; label: string; hint: string }[] = [
    { id: "rules", label: "Paper Rules", hint: "Simulated" },
    { id: "live-rules", label: "Live Rules", hint: "Real money" },
    { id: "paper", label: "Paper Trading", hint: "Simulated" },
    { id: "live", label: "Live Trading", hint: "Real money" },
    { id: "general", label: "General", hint: "Alerts & accounts" },
  ];
  return (
    <div
      className="flex flex-wrap gap-2 rounded-xl border border-border bg-bg-secondary p-1.5"
      role="tablist"
      aria-label="Settings mode"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex min-w-[5.5rem] flex-1 flex-col items-center rounded-lg px-3 py-2.5 text-center transition-colors sm:flex-none sm:min-w-[8.5rem] sm:px-4",
            active === tab.id
              ? tab.id === "live" || tab.id === "live-rules"
                ? "bg-mode-live-soft text-mode-live-fg ring-1 ring-mode-live-border/70"
                : tab.id === "paper" || tab.id === "rules"
                  ? "bg-mode-paper-soft text-mode-paper-fg ring-1 ring-mode-paper-border/70"
                  : "bg-bg-elevated text-text-primary ring-1 ring-border"
              : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          )}
        >
          <span className="text-sm font-semibold">{tab.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-inherit opacity-75">
            {tab.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function ModeBanner({ mode }: { mode: "paper" | "live" }) {
  if (mode === "paper") {
    return (
      <div className="rounded-lg border border-mode-paper-border bg-mode-paper-muted px-4 py-3">
        <p className="text-sm font-medium text-mode-paper-fg">
          Paper trading only — simulated cash, no Zerodha orders
        </p>
        <p className="text-xs text-mode-paper mt-1">
          Changes here affect the Paper Trading tab and strategy auto-scan cron only.
          They do not change live order limits below unless you edit the Live tab.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-mode-live-border bg-mode-live-muted px-4 py-3">
      <p className="text-sm font-medium text-mode-live-fg">
        Live trading — real Zerodha orders and real money
      </p>
      <p className="text-xs text-mode-live-fg/90 mt-1">
        Capital limits and Live Rules apply to algo live orders. Use the kill switch below
        (or Live Rules → Automatic live trading) to stop real orders immediately — paper
        trading is unaffected.
      </p>
    </div>
  );
}

const defaultSettings: AppSettings = {
  paperTrading: {
    startingBalance: 1000000,
    simulateBrokerage: true,
    orderNotional: 100_000,
    maxPerTrade: 500_000,
    minPerTrade: 25_000,
    defaultProductType: "CNC",
    positionSizingMode: "notional",
    positionPct: 10,
    atrRiskPct: 0.5,
    atrPeriod: 14,
    atrStopMultiplier: 2,
  },
  tradingPreferences: {
    defaultExchange: "NSE",
    defaultProductType: "CNC",
    defaultOrderType: "MARKET",
    maxOrderValue: 5_000,
    maxDailyLoss: 50000,
  },
  notifications: {
    orderExecution: true,
    emailDigest: true,
    skippedOrders: false,
    riskExits: true,
    strategySignals: false,
    pnlAlerts: false,
    weeklyShortlist: true,
  },
  paperRules: {
    fixedNotional1L: true,
    basicExits2and5: true,
    maxPositions25: true,
    strategySellsOff: true,
    clearRebuyLocks: false,
    preferStrongSectors: true,
    minBuySignals2: true,
    autoSeedUniverse: true,
    regimeWeighting: true,
    entryConnectedExits: true,
    weeklyShortlistEmail: true,
    emailDigest: true,
    riskExitEmails: true,
  },
  liveRules: {
    autoTradingEnabled: false,
    fixedOrderNotional: true,
    basicExits2and5: true,
    maxPositions10: true,
    strategySellsOff: true,
    clearRebuyLocks: false,
    preferStrongSectors: true,
    minBuySignals3: true,
    autoSeedUniverse: true,
    enforceCapitalLimits: true,
    regimeWeighting: true,
    entryConnectedExits: true,
    emailDigest: true,
    riskExitEmails: true,
    weeklyShortlistEmail: true,
  },
  riskManagement: {
    stopLossPercent: 2,
    takeProfitPercent: 5,
    autoStopLoss: true,
    autoTakeProfit: true,
    maxPositions: 10,
    squareOffTime: "15:15",
    rebuyCooldownMinutes: 240,
    maxRoundTripsPerSymbolPerDay: 1,
    noSameDayRebuyAfterSell: true,
    minHoldMinutesBeforeSell: 0,
    enableStrategySellSignals: false,
    strategySellMinSignals: 2,
    autoTrailingStop: false,
    trailingStopPercent: 2,
    maxHoldDays: 0,
    noProgressDays: 0,
    noProgressMinPct: 0.5,
    autoPauseEnabled: false,
    autoPauseLookbackDays: 14,
    autoPauseMaxLoss: 5000,
  },
  marketRegime: {
    enableRegimeWeighting: true,
    enableEntryConnectedExits: true,
    regimeAdxThreshold: 23,
    momentumRsiOverbought: 85,
  },
  liveTrading: {
    mirrorPaperAutomation: false,
    enableRegimeWeighting: true,
    enableEntryConnectedExits: true,
    regimeAdxThreshold: 23,
    momentumRsiOverbought: 85,
    stopLossPercent: 2,
    takeProfitPercent: 5,
    maxPositions: 10,
    enableStrategySellSignals: false,
    strategySellMinSignals: 2,
    autoTrailingStop: false,
    trailingStopPercent: 2,
    minHoldMinutesBeforeSell: 60,
    orderNotional: 5_000,
    capitalLimit: 50_000,
  },
};

function firestoreToLocal(fs: FirestoreAppSettings): AppSettings {
  return {
    paperTrading: {
      startingBalance: fs.paperStartingBalance,
      simulateBrokerage: fs.simulateBrokerage,
      orderNotional: fs.paperOrderNotional ?? 100_000,
      maxPerTrade: fs.paperMaxOrderValue ?? 500_000,
      minPerTrade: fs.paperMinOrderValue ?? 25_000,
      defaultProductType: (fs.paperDefaultProduct as "CNC" | "MIS") ?? "CNC",
      positionSizingMode: effectivePositionSizingMode({
        positionSizingMode: fs.positionSizingMode as
          | "notional"
          | "portfolio_pct"
          | "atr_risk"
          | undefined,
        positionPct: fs.positionPct,
        ruleFixedNotional1L: fs.ruleFixedNotional1L,
      }),
      positionPct: fs.positionPct ?? 10,
      atrRiskPct: fs.atrRiskPct ?? 0.5,
      atrPeriod: fs.atrPeriod ?? 14,
      atrStopMultiplier: fs.atrStopMultiplier ?? 2,
    },
    tradingPreferences: {
      defaultExchange: fs.defaultExchange as "NSE" | "BSE",
      defaultProductType: fs.defaultProduct as "MIS" | "CNC" | "NRML",
      defaultOrderType: fs.defaultOrderType as "MARKET" | "LIMIT",
      maxOrderValue: fs.liveOrderNotional ?? fs.maxOrderValue ?? 5_000,
      maxDailyLoss: fs.maxDailyLoss,
    },
    notifications: {
      orderExecution: fs.notifyOrders,
      emailDigest: fs.notifyEmailDigest !== false,
      skippedOrders: fs.notifySkipped === true,
      riskExits: fs.notifyRiskExits !== false,
      strategySignals: fs.notifySignals === true,
      pnlAlerts: fs.notifyPnl,
      weeklyShortlist: fs.notifyWeeklyShortlist !== false,
    },
    paperRules: {
      fixedNotional1L: fs.ruleFixedNotional1L !== false,
      basicExits2and5: fs.ruleBasicExits2and5 !== false,
      maxPositions25: fs.ruleMaxPositions25 !== false,
      strategySellsOff: fs.ruleStrategySellsOff !== false,
      clearRebuyLocks: fs.ruleClearRebuyLocks === true,
      preferStrongSectors: fs.rulePreferStrongSectors !== false,
      minBuySignals2: fs.ruleMinBuySignals2 !== false,
      autoSeedUniverse: fs.ruleAutoSeedUniverse !== false,
      regimeWeighting: fs.enableRegimeWeighting !== false,
      entryConnectedExits: fs.enableEntryConnectedExits !== false,
      weeklyShortlistEmail: fs.notifyWeeklyShortlist !== false,
      emailDigest: fs.notifyEmailDigest !== false,
      riskExitEmails: fs.notifyRiskExits !== false,
    },
    liveRules: {
      autoTradingEnabled: fs.liveAutoTradingEnabled === true,
      fixedOrderNotional: fs.liveRuleFixedOrderNotional !== false,
      basicExits2and5: fs.liveRuleBasicExits2and5 !== false,
      maxPositions10: fs.liveRuleMaxPositions10 !== false,
      strategySellsOff: fs.liveRuleStrategySellsOff !== false,
      clearRebuyLocks: fs.liveRuleClearRebuyLocks === true,
      preferStrongSectors: fs.liveRulePreferStrongSectors !== false,
      minBuySignals3: fs.liveRuleMinBuySignals3 !== false,
      autoSeedUniverse: fs.liveRuleAutoSeedUniverse !== false,
      enforceCapitalLimits: fs.liveRuleEnforceCapitalLimits !== false,
      regimeWeighting: fs.liveRuleRegimeWeighting !== false,
      entryConnectedExits: fs.liveRuleEntryConnectedExits !== false,
      emailDigest: fs.liveRuleNotifyEmailDigest !== false,
      riskExitEmails: fs.liveRuleNotifyRiskExits !== false,
      weeklyShortlistEmail: fs.liveRuleNotifyWeeklyShortlist !== false,
    },
    riskManagement: {
      stopLossPercent: fs.stopLossPercent,
      takeProfitPercent: fs.takeProfitPercent,
      autoStopLoss: fs.autoStopLoss ?? true,
      autoTakeProfit: fs.autoTakeProfit !== false,
      maxPositions: fs.maxPositions,
      squareOffTime: fs.squareOffTime,
      rebuyCooldownMinutes: fs.rebuyCooldownMinutes ?? 240,
      maxRoundTripsPerSymbolPerDay: fs.maxRoundTripsPerSymbolPerDay ?? 1,
      noSameDayRebuyAfterSell: fs.noSameDayRebuyAfterSell !== false,
      minHoldMinutesBeforeSell: fs.minHoldMinutesBeforeSell ?? 0,
      enableStrategySellSignals: fs.enableStrategySellSignals === true,
      strategySellMinSignals: fs.strategySellMinSignals ?? 2,
      autoTrailingStop: fs.autoTrailingStop === true,
      trailingStopPercent: fs.trailingStopPercent ?? 2,
      maxHoldDays: fs.maxHoldDays ?? 0,
      noProgressDays: fs.noProgressDays ?? 0,
      noProgressMinPct: fs.noProgressMinPct ?? 0.5,
      autoPauseEnabled: fs.autoPauseEnabled === true,
      autoPauseLookbackDays: fs.autoPauseLookbackDays ?? 14,
      autoPauseMaxLoss: fs.autoPauseMaxLoss ?? 5000,
    },
    marketRegime: {
      enableRegimeWeighting: fs.enableRegimeWeighting !== false,
      enableEntryConnectedExits: fs.enableEntryConnectedExits !== false,
      regimeAdxThreshold: fs.regimeAdxThreshold ?? 23,
      momentumRsiOverbought: fs.momentumRsiOverbought ?? 85,
    },
    liveTrading: {
      mirrorPaperAutomation: fs.liveMirrorPaperAutomation === true,
      enableRegimeWeighting:
        fs.liveEnableRegimeWeighting ?? fs.enableRegimeWeighting !== false,
      enableEntryConnectedExits:
        fs.liveEnableEntryConnectedExits ?? fs.enableEntryConnectedExits !== false,
      regimeAdxThreshold:
        fs.liveRegimeAdxThreshold ?? fs.regimeAdxThreshold ?? 23,
      momentumRsiOverbought:
        fs.liveMomentumRsiOverbought ?? fs.momentumRsiOverbought ?? 85,
      stopLossPercent: fs.liveStopLossPercent ?? fs.stopLossPercent ?? 2,
      takeProfitPercent: fs.liveTakeProfitPercent ?? fs.takeProfitPercent ?? 5,
      maxPositions: fs.liveMaxPositions ?? fs.maxPositions ?? 5,
      enableStrategySellSignals:
        fs.liveEnableStrategySellSignals ?? fs.enableStrategySellSignals !== false,
      strategySellMinSignals:
        fs.liveStrategySellMinSignals ?? fs.strategySellMinSignals ?? 2,
      autoTrailingStop:
        fs.liveAutoTrailingStop ?? fs.autoTrailingStop !== false,
      trailingStopPercent:
        fs.liveTrailingStopPercent ?? fs.trailingStopPercent ?? 2,
      minHoldMinutesBeforeSell:
        fs.liveMinHoldMinutesBeforeSell ?? fs.minHoldMinutesBeforeSell ?? 60,
      orderNotional: fs.liveOrderNotional ?? fs.maxOrderValue ?? 5_000,
      capitalLimit: fs.liveCapitalLimit ?? 50_000,
    },
  };
}

function localToFirestore(s: AppSettings): Partial<FirestoreAppSettings> {
  return {
    defaultExchange: s.tradingPreferences.defaultExchange,
    defaultProduct: s.tradingPreferences.defaultProductType,
    defaultOrderType: s.tradingPreferences.defaultOrderType,
    maxOrderValue: s.liveTrading.orderNotional,
    liveOrderNotional: s.liveTrading.orderNotional,
    liveCapitalLimit: s.liveTrading.capitalLimit,
    maxDailyLoss: s.tradingPreferences.maxDailyLoss,
    paperStartingBalance: s.paperTrading.startingBalance,
    simulateBrokerage: s.paperTrading.simulateBrokerage,
    paperOrderNotional: s.paperTrading.orderNotional,
    paperMaxOrderValue: Math.max(1000, s.paperTrading.maxPerTrade ?? 500_000),
    paperMinOrderValue: Math.max(0, s.paperTrading.minPerTrade ?? 25_000),
    paperDefaultProduct: s.paperTrading.defaultProductType,
    positionSizingMode: s.paperTrading.positionSizingMode,
    positionPct: s.paperTrading.positionPct,
    atrRiskPct: s.paperTrading.atrRiskPct,
    atrPeriod: s.paperTrading.atrPeriod,
    atrStopMultiplier: s.paperTrading.atrStopMultiplier,
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
    enableRegimeWeighting: s.paperRules.regimeWeighting,
    enableEntryConnectedExits: s.paperRules.entryConnectedExits,
    regimeIndexSymbol: "^NSEI",
    regimeAdxPeriod: 14,
    regimeAdxThreshold: s.marketRegime.regimeAdxThreshold,
    regimeAdxSlopeWindow: 5,
    momentumRsiOverbought: s.marketRegime.momentumRsiOverbought,
    liveMirrorPaperAutomation: s.liveTrading.mirrorPaperAutomation,
    liveAutoTradingEnabled: s.liveRules.autoTradingEnabled,
    liveRuleFixedOrderNotional: s.liveRules.fixedOrderNotional,
    liveRuleBasicExits2and5: s.liveRules.basicExits2and5,
    liveRuleMaxPositions10: s.liveRules.maxPositions10,
    liveRuleStrategySellsOff: s.liveRules.strategySellsOff,
    liveRuleClearRebuyLocks: s.liveRules.clearRebuyLocks,
    liveRulePreferStrongSectors: s.liveRules.preferStrongSectors,
    liveRuleMinBuySignals3: s.liveRules.minBuySignals3,
    liveRuleAutoSeedUniverse: s.liveRules.autoSeedUniverse,
    liveRuleEnforceCapitalLimits: s.liveRules.enforceCapitalLimits,
    liveRuleRegimeWeighting: s.liveRules.regimeWeighting,
    liveRuleEntryConnectedExits: s.liveRules.entryConnectedExits,
    liveRuleNotifyEmailDigest: s.liveRules.emailDigest,
    liveRuleNotifyRiskExits: s.liveRules.riskExitEmails,
    liveRuleNotifyWeeklyShortlist: s.liveRules.weeklyShortlistEmail,
    liveEnableRegimeWeighting: s.liveRules.regimeWeighting
      ? s.liveTrading.enableRegimeWeighting
      : false,
    liveEnableEntryConnectedExits: s.liveRules.entryConnectedExits
      ? s.liveTrading.enableEntryConnectedExits
      : false,
    liveRegimeAdxThreshold: s.liveTrading.regimeAdxThreshold,
    liveMomentumRsiOverbought: s.liveTrading.momentumRsiOverbought,
    liveStopLossPercent: s.liveTrading.stopLossPercent,
    liveTakeProfitPercent: s.liveTrading.takeProfitPercent,
    liveMaxPositions: s.liveTrading.maxPositions,
    liveEnableStrategySellSignals: s.liveTrading.enableStrategySellSignals,
    liveStrategySellMinSignals: s.liveTrading.strategySellMinSignals,
    liveAutoTrailingStop: s.liveTrading.autoTrailingStop,
    liveTrailingStopPercent: s.liveTrading.trailingStopPercent,
    liveMinHoldMinutesBeforeSell: s.liveTrading.minHoldMinutesBeforeSell,
    notifyOrders: s.notifications.orderExecution,
    notifyEmailDigest: s.paperRules.emailDigest,
    notifySkipped: s.notifications.skippedOrders,
    notifyRiskExits: s.paperRules.riskExitEmails,
    notifySignals: s.notifications.strategySignals,
    notifyPnl: s.notifications.pnlAlerts,
    notifyWeeklyShortlist: s.paperRules.weeklyShortlistEmail,
    ruleFixedNotional1L: s.paperRules.fixedNotional1L,
    ruleBasicExits2and5: s.paperRules.basicExits2and5,
    ruleMaxPositions25: s.paperRules.maxPositions25,
    ruleStrategySellsOff: s.paperRules.strategySellsOff,
    ruleClearRebuyLocks: s.paperRules.clearRebuyLocks,
    rulePreferStrongSectors: s.paperRules.preferStrongSectors,
    ruleMinBuySignals2: s.paperRules.minBuySignals2,
    ruleAutoSeedUniverse: s.paperRules.autoSeedUniverse,
  };
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: SettingsTab =
    tabParam === "live"
      ? "live"
      : tabParam === "live-rules"
        ? "live-rules"
        : tabParam === "general"
          ? "general"
          : tabParam === "rules"
            ? "rules"
            : tabParam === "paper"
              ? "paper"
              : "rules";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const { user } = useAuth();
  const toastApi = useOptionalToast();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
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
          toastApi.success(`Account ${data.userName || kiteUserId} reconnected! To add a different account, log out of kite.zerodha.com first.`);
        } else {
          toastApi.success(`New account ${data.userName || kiteUserId} added successfully!`);
        }
        await persistServerToken(data.userId || kiteUserId);
        await loadAccounts();
      } else {
        toastApi.error("Connection failed. Please try again.");
      }
    } catch (e) {
      console.error("Error saving new account:", e);
      toastApi.error("Account connected but failed to save metadata.");
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
      // Keep encrypted server tokens fresh for cron live auto-trading.
      for (const id of connectedIds) {
        void persistServerToken(id);
      }
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
      toastApi.success(`Account ${kiteUserId} disconnected.`);
    } catch {
      toastApi.error("Failed to disconnect account.");
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
      toastApi.success(`Account ${kiteUserId} removed.`);
    } catch {
      toastApi.error("Failed to remove account.");
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
      toastApi.error("Failed to update label.");
    }
  }

  async function handleReconnect(kiteUserId: string) {
    window.location.href = "/api/zerodha/login";
  }

  async function handleSave() {
    if (!user) {
      toastApi.error("Sign in to save settings to the cloud.");
      return;
    }

    setSaving(true);
        const flat = { ...DEFAULT_SETTINGS, ...localToFirestore(settings) };

    try {
      saveSettingsToCache(flat);
      await saveFirestoreSettings(localToFirestore(settings));
      const balanceResult = await applyPaperStartingBalanceIfFlat();
      if (balanceResult === "applied") {
        toastApi.success(
          "Settings saved. Paper cash balance updated to your new starting amount (no open positions)."
        );
        window.dispatchEvent(new CustomEvent("paper-trading-updated"));
      } else if (balanceResult === "skipped_has_positions") {
        toastApi.success(
          "Settings saved. Reset paper portfolio to apply a new starting balance while you have holdings."
        );
      } else {
        toastApi.success("Settings saved successfully!");
      }
    } catch (e) {
      console.error("Failed to save settings to Firestore:", e);
      const msg =
        e instanceof Error ? e.message : "Could not sync to cloud";
      toastApi.error(
        `Saved on this device only. Cloud sync failed: ${msg}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetPaperPortfolio() {
    setResetLoading(true);
    setResetMessage(null);
        try {
      await resetPaperTrading();
      localStorage.removeItem("paper_trading_state");
      localStorage.removeItem("paperTrades");
      setResetConfirm(false);
      const starting = settings.paperTrading.startingBalance;
      const msg = `Paper portfolio reset — balance ${formatCurrency(starting)}, orders cleared, scan locks cleared.`;
      setResetMessage({ ok: true, text: msg });
      toastApi.success(msg);
      window.dispatchEvent(new CustomEvent("paper-trading-updated"));
      window.dispatchEvent(new CustomEvent("strategies-updated"));
    } catch (e) {
      const msg =
        e instanceof Error
          ? `Reset failed: ${e.message}`
          : "Reset failed — please try again.";
      setResetMessage({ ok: false, text: msg });
      toastApi.error(msg);
    } finally {
      setResetLoading(false);
    }
  }

  function updateSettings<K extends keyof AppSettings>(
    section: K,
    updates: Partial<AppSettings[K]>
  ) {
    setSettings((prev) => {
      const nextSection = { ...prev[section], ...updates } as AppSettings[K];
      const next: AppSettings = { ...prev, [section]: nextSection };
      if (section === "notifications") {
        const n = next.notifications;
        next.paperRules = {
          ...next.paperRules,
          emailDigest: n.emailDigest,
          riskExitEmails: n.riskExits,
          weeklyShortlistEmail: n.weeklyShortlist,
        };
      }
      if (section === "marketRegime") {
        const m = next.marketRegime;
        next.paperRules = {
          ...next.paperRules,
          regimeWeighting: m.enableRegimeWeighting,
          entryConnectedExits: m.enableEntryConnectedExits,
        };
      }
      return next;
    });
  }

  /** Toggle a Rules checklist item and keep related sections in sync. */
  function togglePaperRule(
    localKey: keyof AppSettings["paperRules"],
    enabled: boolean
  ) {
    setSettings((prev) => {
      const paperRules = { ...prev.paperRules, [localKey]: enabled };
      const notifications = { ...prev.notifications };
      const marketRegime = { ...prev.marketRegime };
      if (localKey === "emailDigest") notifications.emailDigest = enabled;
      if (localKey === "riskExitEmails") notifications.riskExits = enabled;
      if (localKey === "weeklyShortlistEmail") {
        notifications.weeklyShortlist = enabled;
      }
      if (localKey === "regimeWeighting") {
        marketRegime.enableRegimeWeighting = enabled;
      }
      if (localKey === "entryConnectedExits") {
        marketRegime.enableEntryConnectedExits = enabled;
      }
      return { ...prev, paperRules, notifications, marketRegime };
    });
  }

  function toggleLiveRule(
    localKey: keyof AppSettings["liveRules"],
    enabled: boolean
  ) {
    setSettings((prev) => ({
      ...prev,
      liveRules: { ...prev.liveRules, [localKey]: enabled },
    }));
  }

  async function persistServerToken(kiteUserId: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch("/api/zerodha/persist-token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: kiteUserId }),
      });
    } catch (e) {
      console.warn("Failed to persist Kite token for live auto-trading:", e);
    }
  }

  const RULE_UI_KEYS: {
    catalogKey: PaperRuleKey;
    localKey: keyof AppSettings["paperRules"];
  }[] = [
    { catalogKey: "ruleFixedNotional1L", localKey: "fixedNotional1L" },
    { catalogKey: "ruleBasicExits2and5", localKey: "basicExits2and5" },
    { catalogKey: "ruleMaxPositions25", localKey: "maxPositions25" },
    { catalogKey: "ruleStrategySellsOff", localKey: "strategySellsOff" },
    { catalogKey: "ruleClearRebuyLocks", localKey: "clearRebuyLocks" },
    { catalogKey: "rulePreferStrongSectors", localKey: "preferStrongSectors" },
    { catalogKey: "ruleMinBuySignals2", localKey: "minBuySignals2" },
    { catalogKey: "ruleAutoSeedUniverse", localKey: "autoSeedUniverse" },
    { catalogKey: "enableRegimeWeighting", localKey: "regimeWeighting" },
    { catalogKey: "enableEntryConnectedExits", localKey: "entryConnectedExits" },
    { catalogKey: "notifyEmailDigest", localKey: "emailDigest" },
    { catalogKey: "notifyRiskExits", localKey: "riskExitEmails" },
    { catalogKey: "notifyWeeklyShortlist", localKey: "weeklyShortlistEmail" },
  ];

  const LIVE_RULE_UI_KEYS: {
    catalogKey: LiveRuleKey;
    localKey: keyof AppSettings["liveRules"];
  }[] = [
    { catalogKey: "liveAutoTradingEnabled", localKey: "autoTradingEnabled" },
    { catalogKey: "liveRuleFixedOrderNotional", localKey: "fixedOrderNotional" },
    { catalogKey: "liveRuleEnforceCapitalLimits", localKey: "enforceCapitalLimits" },
    { catalogKey: "liveRuleBasicExits2and5", localKey: "basicExits2and5" },
    { catalogKey: "liveRuleMaxPositions10", localKey: "maxPositions10" },
    { catalogKey: "liveRuleStrategySellsOff", localKey: "strategySellsOff" },
    { catalogKey: "liveRuleClearRebuyLocks", localKey: "clearRebuyLocks" },
    { catalogKey: "liveRulePreferStrongSectors", localKey: "preferStrongSectors" },
    { catalogKey: "liveRuleMinBuySignals3", localKey: "minBuySignals3" },
    { catalogKey: "liveRuleAutoSeedUniverse", localKey: "autoSeedUniverse" },
    { catalogKey: "liveRuleRegimeWeighting", localKey: "regimeWeighting" },
    { catalogKey: "liveRuleEntryConnectedExits", localKey: "entryConnectedExits" },
    { catalogKey: "liveRuleNotifyEmailDigest", localKey: "emailDigest" },
    { catalogKey: "liveRuleNotifyRiskExits", localKey: "riskExitEmails" },
    { catalogKey: "liveRuleNotifyWeeklyShortlist", localKey: "weeklyShortlistEmail" },
  ];

  const connectedCount = accounts.filter((a) => a.connected).length;

  const settingsMode =
    activeTab === "live" || activeTab === "live-rules"
      ? "live"
      : activeTab === "paper" || activeTab === "rules"
        ? "paper"
        : "neutral";

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Configure your trading preferences & connections"
        mode={settingsMode}
        eyebrow={
          settingsMode === "paper"
            ? "Simulated"
            : settingsMode === "live"
              ? "Real money"
              : "App preferences"
        }
        padded={false}
        className="mb-2"
        actions={
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-brand transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save className={cn("h-4 w-4", saving && "animate-pulse")} />
            {saving ? "Saving…" : "Save Settings"}
          </button>
        }
      />

      <SettingsTabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "rules" && (
        <section className="card border-mode-paper-border/60">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-mode-paper-soft p-2">
              <ListChecks className="h-5 w-5 text-mode-paper" />
            </div>
            <div>
              <h2 className="type-title text-text-primary">
                Paper trading rules
              </h2>
              <p className="type-caption text-text-secondary mt-0.5">
                Everything we applied over time — turn a rule off to test what
                still works. Save after changing, then wait for the next scan.
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-mode-paper-border bg-mode-paper-muted px-4 py-3">
            <p className="text-xs text-mode-paper-fg leading-relaxed">
              Checked = rule is active on cron. Unchecked = use the matching
              fields on the Paper / General tabs (or skip that behavior). Active
              now:{" "}
              <strong>
                {
                  RULE_UI_KEYS.filter(
                    ({ localKey }) => settings.paperRules[localKey]
                  ).length
                }
                /{RULE_UI_KEYS.length}
              </strong>
            </p>
          </div>

          {(
            [
              "Sizing",
              "Exits",
              "Portfolio",
              "Gates",
              "Ranking",
              "Universe",
              "Email",
            ] as const
          ).map((category) => {
            const items = RULE_UI_KEYS.filter(({ catalogKey }) => {
              const def = PAPER_RULE_CATALOG.find((r) => r.key === catalogKey);
              return def?.category === category;
            });
            if (items.length === 0) return null;
            return (
              <div key={category} className="mb-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map(({ catalogKey, localKey }) => {
                    const def = PAPER_RULE_CATALOG.find(
                      (r) => r.key === catalogKey
                    )!;
                    const on = settings.paperRules[localKey];
                    return (
                      <div
                        key={catalogKey}
                        className="flex items-start justify-between gap-3 rounded-lg bg-bg-tertiary p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">
                            {def.label}
                          </p>
                          <p className="mt-1 text-xs text-text-tertiary leading-relaxed">
                            {def.description}
                          </p>
                        </div>
                        <label className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              togglePaperRule(localKey, e.target.checked)
                            }
                            className="peer sr-only"
                          />
                          <span className="h-6 w-11 rounded-full bg-border peer-checked:bg-mode-paper transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-text-tertiary">
            Tip: turn off one rule at a time, Save, then compare the next scan
            email / fills. Live Rules are separate — changing these does not
            affect live algo trading.
          </p>
        </section>
      )}

      {activeTab === "live-rules" && (
        <section className="card border-mode-live-border/60">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-mode-live-soft p-2">
              <ListChecks className="h-5 w-5 text-mode-live" />
            </div>
            <div>
              <h2 className="type-title text-text-primary">
                Live trading rules
              </h2>
              <p className="type-caption text-text-secondary mt-0.5">
                Full copy of Paper Rules with the same defaults — test on paper
                first, then flip the matching live rule. Changes here never
                affect paper. Save after changing.
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-mode-live-border bg-mode-live-muted px-4 py-3">
            <p className="text-xs text-mode-live-fg leading-relaxed">
              Kill switch is{" "}
              <strong>
                {settings.liveRules.autoTradingEnabled ? "ON" : "OFF"}
              </strong>
              . Server also requires{" "}
              <code className="rounded bg-mode-live-soft px-1">ENABLE_LIVE_TRADING=true</code>
              . Active rules:{" "}
              <strong>
                {
                  LIVE_RULE_UI_KEYS.filter(
                    ({ localKey }) => settings.liveRules[localKey]
                  ).length
                }
                /{LIVE_RULE_UI_KEYS.length}
              </strong>
              {" "}(mirrors Paper Rules + live capital / master switch).
            </p>
          </div>

          {(
            [
              "Master",
              "Sizing",
              "Exits",
              "Portfolio",
              "Gates",
              "Ranking",
              "Universe",
              "Email",
            ] as const
          ).map((category) => {
            const items = LIVE_RULE_UI_KEYS.filter(({ catalogKey }) => {
              const def = LIVE_RULE_CATALOG.find((r) => r.key === catalogKey);
              return def?.category === category;
            });
            if (items.length === 0) return null;
            return (
              <div key={category} className="mb-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map(({ catalogKey, localKey }) => {
                    const def = LIVE_RULE_CATALOG.find(
                      (r) => r.key === catalogKey
                    )!;
                    const on = settings.liveRules[localKey];
                    return (
                      <div
                        key={catalogKey}
                        className="flex items-start justify-between gap-3 rounded-lg bg-bg-tertiary p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">
                            {def.label}
                          </p>
                          <p className="mt-1 text-xs text-text-tertiary leading-relaxed">
                            {def.description}
                          </p>
                        </div>
                        <label className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              toggleLiveRule(localKey, e.target.checked)
                            }
                            className="peer sr-only"
                          />
                          <span
                            className={cn(
                              "h-6 w-11 rounded-full bg-border peer-checked:bg-mode-live transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5",
                              localKey === "autoTradingEnabled" &&
                                on &&
                                "peer-checked:bg-loss"
                            )}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {activeTab === "live" && (
        <>
          <ModeBanner mode="live" />

          {/* ── Live Trading (mirrors Paper Trading card) ───────────────── */}
          <section className="card border-mode-live-border/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-mode-live-soft p-2">
                  <Wallet className="h-5 w-5 text-mode-live" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Live Trading
                  </h2>
                  <p className="text-xs text-text-secondary">
                    Real money capital &amp; order sizing — independent from paper ₹ amounts
                  </p>
                </div>
              </div>
              <LiveAutoSwitch
                enabled={settings.liveRules.autoTradingEnabled}
                onToggle={(next) => toggleLiveRule("autoTradingEnabled", next)}
              />
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Total capital limit (₹)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={settings.liveTrading.capitalLimit}
                    onChange={(e) =>
                      updateSettings("liveTrading", {
                        capitalLimit: Math.max(1000, Number(e.target.value) || 50_000),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  />
                  <p className="mt-1 text-[10px] text-text-tertiary">
                    Max deployed in live holdings/positions. Default ₹50,000.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Order size per trade (₹)
                  </label>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={settings.liveTrading.orderNotional}
                    onChange={(e) => {
                      const orderNotional = Math.max(
                        500,
                        Number(e.target.value) || 5_000
                      );
                      updateSettings("liveTrading", { orderNotional });
                      updateSettings("tradingPreferences", {
                        maxOrderValue: orderNotional,
                      });
                    }}
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  />
                  <p className="mt-1 text-[10px] text-text-tertiary">
                    Used when Live Rules → Fixed order size is on. Default ₹5,000.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Max daily loss (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.tradingPreferences.maxDailyLoss}
                    onChange={(e) =>
                      updateSettings("tradingPreferences", {
                        maxDailyLoss: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  />
                  <p className="mt-1 text-[10px] text-text-tertiary">0 = no daily loss halt</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Live product type
                  </label>
                  <select
                    value={settings.tradingPreferences.defaultProductType}
                    onChange={(e) =>
                      updateSettings("tradingPreferences", {
                        defaultProductType: e.target.value as "MIS" | "CNC" | "NRML",
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  >
                    <option value="CNC">CNC (Delivery) — recommended</option>
                    <option value="MIS">MIS (Intraday)</option>
                    <option value="NRML">NRML (F&amp;O)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Default exchange
                  </label>
                  <select
                    value={settings.tradingPreferences.defaultExchange}
                    onChange={(e) =>
                      updateSettings("tradingPreferences", {
                        defaultExchange: e.target.value as "NSE" | "BSE",
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  >
                    <option value="NSE">NSE</option>
                    <option value="BSE">BSE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Default order type
                  </label>
                  <select
                    value={settings.tradingPreferences.defaultOrderType}
                    onChange={(e) =>
                      updateSettings("tradingPreferences", {
                        defaultOrderType: e.target.value as "MARKET" | "LIMIT",
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  >
                    <option value="MARKET">Market</option>
                    <option value="LIMIT">Limit</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-mode-live-border/60/80 pt-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-mode-live-soft p-1.5">
                      <Users className="h-4 w-4 text-mode-live" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">
                        Zerodha Accounts
                      </h3>
                      <p className="text-[11px] text-text-secondary">
                        {connectedCount}/{accounts.length || 0} connected · tokens expire daily
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {availableApps.length <= 1 ? (
                      <a
                        href="/api/zerodha/login"
                        className="inline-flex items-center gap-1.5 rounded-md bg-mode-live px-3 py-1.5 text-xs font-semibold text-white hover:bg-mode-live-hover"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Connect
                      </a>
                    ) : (
                      availableApps.map((app) => (
                        <a
                          key={app.index}
                          href={`/api/zerodha/login?credIndex=${app.index}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-mode-live px-3 py-1.5 text-xs font-semibold text-white hover:bg-mode-live-hover"
                          title={`API Key: ${app.apiKeyPrefix}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {app.label}
                        </a>
                      ))
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-text-tertiary leading-snug">
                  Add funds on{" "}
                  <a
                    href="https://kite.zerodha.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Kite
                  </a>
                  . Log out there first to link another ID.
                </p>
                {loadingAccounts ? (
                  <div className="flex items-center gap-2 text-text-tertiary text-xs py-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Loading accounts…
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-mode-live-border px-4 py-5 text-center">
                    <p className="text-sm text-text-secondary">No accounts connected</p>
                    <p className="text-xs text-text-tertiary mt-1">
                      Connect LX2075 to use live prices and orders
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {accounts.map((account) => (
                      <div
                        key={account.kiteUserId}
                        className={cn(
                          "rounded-md border px-2.5 py-2 flex flex-col gap-1",
                          account.connected
                            ? "border-mode-live-border/60 bg-mode-live-muted/40"
                            : "border-border bg-bg-tertiary/60"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {editingLabel === account.kiteUserId ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={labelInput}
                                  onChange={(e) => setLabelInput(e.target.value)}
                                  className="w-full rounded border border-border bg-bg-primary px-1.5 py-0.5 text-[11px]"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleSaveLabel(account.kiteUserId);
                                    if (e.key === "Escape") {
                                      setEditingLabel(null);
                                      setLabelInput("");
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveLabel(account.kiteUserId)}
                                  className="text-profit"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 min-w-0">
                                <p className="text-xs font-semibold text-text-primary truncate">
                                  {account.label ||
                                    account.userName ||
                                    account.kiteUserId}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLabel(account.kiteUserId);
                                    setLabelInput(account.label || "");
                                  }}
                                  className="text-text-tertiary hover:text-text-secondary shrink-0"
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </button>
                                <span className="text-[10px] font-mono text-text-tertiary truncate">
                                  · {account.kiteUserId}
                                </span>
                              </div>
                            )}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                              account.connected
                                ? "bg-emerald-200/80 text-mode-live-fg"
                                : "bg-loss/15 text-loss"
                            )}
                          >
                            {account.connected ? "Live" : "Expired"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {account.connected && accountFunds[account.kiteUserId] ? (
                            <p className="text-[10px] text-text-secondary tabular-nums truncate">
                              Avail{" "}
                              {formatCurrency(
                                accountFunds[account.kiteUserId].available
                              )}
                              {accountFunds[account.kiteUserId].used > 0
                                ? ` · Used ${formatCurrency(accountFunds[account.kiteUserId].used)}`
                                : ""}
                            </p>
                          ) : (
                            <p className="text-[10px] text-text-tertiary truncate">
                              {account.email || "Reconnect for margins"}
                            </p>
                          )}
                          <div className="flex items-center gap-1 shrink-0">
                            {account.connected ? (
                              <button
                                type="button"
                                onClick={() => handleDisconnect(account.kiteUserId)}
                                disabled={disconnectingAccount === account.kiteUserId}
                                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-loss hover:bg-loss/10 disabled:opacity-50"
                              >
                                {disconnectingAccount === account.kiteUserId
                                  ? "…"
                                  : "Disconnect"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleReconnect(account.kiteUserId)}
                                className="rounded bg-mode-live px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-mode-live-hover"
                              >
                                Reconnect
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveAccount(account.kiteUserId)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary hover:bg-loss/10 hover:text-loss"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Live Auto-Scan — Market Regime (mirrors paper sky card) ─── */}
          <section className="rounded-xl border border-mode-live-border bg-mode-live-muted/80 p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Live Auto-Scan — Market Regime &amp; Exits
              </h2>
              <p className="text-xs text-text-tertiary mt-1">
                Same controls as Paper Auto-Scan, stored separately. Prefer toggling
                via Live Rules; fields below apply when mirror is off and the
                matching rule is off.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={settings.liveTrading.mirrorPaperAutomation}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      mirrorPaperAutomation: e.target.checked,
                    })
                  }
                  className="peer sr-only"
                />
                <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-mode-live peer-focus:ring-2 peer-focus:ring-mode-live/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Use same automation as Paper tab
                </p>
                <p className="text-xs text-text-tertiary">
                  Off by default so live stays independent while you experiment on paper.
                </p>
              </div>
            </div>

            {!settings.liveTrading.mirrorPaperAutomation && (
              <div className="grid gap-4 sm:grid-cols-2 border-t border-mode-live-border/60 pt-4">
                <div className="flex items-center gap-3 sm:col-span-2">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.liveTrading.enableRegimeWeighting}
                      onChange={(e) =>
                        updateSettings("liveTrading", {
                          enableRegimeWeighting: e.target.checked,
                        })
                      }
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-mode-live after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white peer-checked:after:translate-x-full" />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Regime-weighted buys
                    </p>
                    <p className="text-xs text-text-tertiary">
                      ADX regime weighting for live entries (also on Live Rules).
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.liveTrading.enableEntryConnectedExits}
                      onChange={(e) =>
                        updateSettings("liveTrading", {
                          enableEntryConnectedExits: e.target.checked,
                        })
                      }
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-mode-live after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white peer-checked:after:translate-x-full" />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Entry-connected strategy sells
                    </p>
                    <p className="text-xs text-text-tertiary">
                      Only count sells compatible with how the live position was opened.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    ADX regime threshold
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={40}
                    value={settings.liveTrading.regimeAdxThreshold}
                    onChange={(e) =>
                      updateSettings("liveTrading", {
                        regimeAdxThreshold: Math.max(
                          10,
                          Number(e.target.value) || 23
                        ),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    Momentum RSI sell (overbought)
                  </label>
                  <input
                    type="number"
                    min={70}
                    max={95}
                    value={settings.liveTrading.momentumRsiOverbought}
                    onChange={(e) =>
                      updateSettings("liveTrading", {
                        momentumRsiOverbought: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── Live Auto-Scan — Risk (mirrors paper risk card) ─────────── */}
          <section className="card border-mode-live-border/60">
            <div className="flex items-center gap-3 mb-5">
              <div className="rounded-lg bg-mode-live-soft p-2">
                <ShieldCheck className="h-5 w-5 text-mode-live" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Live Auto-Scan — Risk &amp; Strategy Exits
                </h2>
                <p className="text-xs text-text-secondary">
                  Same layout as paper risk — values are live-only. Live Rules basic
                  exits (−2% / +5%) override these when that rule is on.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div className="flex items-center justify-between rounded-lg bg-bg-tertiary p-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Auto trailing stop
                  </p>
                  <p className="text-xs text-text-tertiary">
                    Trail after min profit ({settings.liveTrading.takeProfitPercent}%
                    gate)
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.liveTrading.autoTrailingStop}
                    onChange={(e) =>
                      updateSettings("liveTrading", {
                        autoTrailingStop: e.target.checked,
                      })
                    }
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-bg-hover peer-checked:bg-mode-live after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white peer-checked:after:translate-x-full" />
                </label>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-bg-tertiary p-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Strategy SELL signals
                  </p>
                  <p className="text-xs text-text-tertiary">
                    Off when Live Rules ignore strategy sells (default)
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.liveTrading.enableStrategySellSignals}
                    onChange={(e) =>
                      updateSettings("liveTrading", {
                        enableStrategySellSignals: e.target.checked,
                      })
                    }
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-bg-hover peer-checked:bg-mode-live after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white peer-checked:after:translate-x-full" />
                </label>
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
                  value={settings.liveTrading.stopLossPercent}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      stopLossPercent: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Min profit % (strategy sells &amp; trail)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={settings.liveTrading.takeProfitPercent}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      takeProfitPercent: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Max Positions
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.liveTrading.maxPositions}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      maxPositions: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Trailing stop (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={settings.liveTrading.trailingStopPercent}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      trailingStopPercent: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Min hold before strategy sell (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={settings.liveTrading.minHoldMinutesBeforeSell}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      minHoldMinutesBeforeSell: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Strategy sell min signals
                </label>
                <input
                  type="number"
                  min={1}
                  value={settings.liveTrading.strategySellMinSignals}
                  onChange={(e) =>
                    updateSettings("liveTrading", {
                      strategySellMinSignals: Math.max(
                        1,
                        Number(e.target.value) || 2
                      ),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-mode-live focus:outline-none focus:ring-1 focus:ring-mode-live"
                />
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === "paper" && (
        <>
          <ModeBanner mode="paper" />
      {/* ── Paper Trading Settings ──────────────────────────────────────── */}
      <section className="card border-mode-paper-border/60">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-accent-muted p-2">
            <Wallet className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Paper Trading
            </h2>
            <p className="text-xs text-text-secondary">
              Simulated portfolio, sizing, and reset — does not affect live Zerodha orders
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
                Max per trade (₹)
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={settings.paperTrading.maxPerTrade}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    maxPerTrade: Math.max(1000, Number(e.target.value) || 500_000),
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-[10px] text-text-tertiary">
                Per-trade ceiling applied first; fixed ₹, % of balance, and ATR sizing all work within this cap.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Min per trade (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={settings.paperTrading.minPerTrade}
                onChange={(e) =>
                  updateSettings("paperTrading", {
                    minPerTrade: Math.max(0, Number(e.target.value) || 25_000),
                  })
                }
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-[10px] text-text-tertiary">
                Skip buys when sizing (fixed ₹, %, ATR) produces turnover below this — no bump-up; scan tries the next symbol.
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
                    Risk % of balance per trade
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
                  <p className="mt-1 text-[10px] text-text-tertiary">
                    Rupees at risk if stopped at ATR × multiplier below (e.g. 1% of ₹10L = ₹10k risk).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    ATR stop multiplier
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={settings.paperTrading.atrStopMultiplier}
                    onChange={(e) =>
                      updateSettings("paperTrading", {
                        atrStopMultiplier: Math.max(0.5, Number(e.target.value) || 2),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="mt-1 text-[10px] text-text-tertiary">
                    Stop distance = multiplier × ATR (default 2). Higher vol → smaller position.
                  </p>
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
                    ? "bg-emerald-50 text-mode-live border border-mode-live-border/60"
                    : "bg-loss-muted text-loss"
                )}
              >
                {resetMessage.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Market Regime & Entry-Connected Exits (paper auto-scan) ─────── */}
      <section className="rounded-xl border border-mode-paper-border bg-mode-paper-muted/80 p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Paper Auto-Scan — Market Regime &amp; Exits
          </h2>
          <p className="text-xs text-text-tertiary mt-1">
            Index ADX (^NSEI) weights buy strategies. Entry-connected exits only count sell
            signals compatible with how the position was opened. Your stop loss and{" "}
            {settings.riskManagement.takeProfitPercent}% min-profit gate for strategy sells
            are unchanged.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.marketRegime.enableRegimeWeighting}
                onChange={(e) =>
                  updateSettings("marketRegime", {
                    enableRegimeWeighting: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">
                Regime-weighted buys
              </p>
              <p className="text-xs text-text-tertiary">
                ADX &gt; threshold → favor trend/momentum entries; ADX ≤ threshold → favor
                mean reversion. Stock universe (Top 100 vs Nifty 50) is unchanged.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.marketRegime.enableEntryConnectedExits}
                onChange={(e) =>
                  updateSettings("marketRegime", {
                    enableEntryConnectedExits: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-bg-tertiary peer-checked:bg-accent peer-focus:ring-2 peer-focus:ring-accent/30 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
            </label>
            <div>
              <p className="text-sm font-medium text-text-primary">
                Entry-connected strategy sells
              </p>
              <p className="text-xs text-text-tertiary">
                Momentum breakout positions ignore incompatible sells (e.g. BB reversion).
                RSI exhaustion uses a higher overbought bar on momentum entries.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              ADX regime threshold
            </label>
            <input
              type="number"
              min="10"
              max="40"
              step="1"
              value={settings.marketRegime.regimeAdxThreshold}
              onChange={(e) =>
                updateSettings("marketRegime", {
                  regimeAdxThreshold: Math.max(10, Number(e.target.value) || 23),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Momentum RSI sell (overbought)
            </label>
            <input
              type="number"
              min="70"
              max="95"
              step="1"
              value={settings.marketRegime.momentumRsiOverbought}
              onChange={(e) =>
                updateSettings("marketRegime", {
                  momentumRsiOverbought: Math.min(
                    95,
                    Math.max(70, Number(e.target.value) || 85)
                  ),
                })
              }
              className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Default RSI sell is 70 — raised on momentum entries so RSI &gt; 70 at buy does
              not exit immediately.
            </p>
          </div>
        </div>
      </section>

      {/* ── Paper risk & strategy exits ─────────────────────────────────── */}
      <section className="card border-mode-paper-border/60">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg bg-mode-paper-soft p-2">
            <ShieldCheck className="h-5 w-5 text-mode-paper" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Paper Auto-Scan — Risk &amp; Strategy Exits
            </h2>
            <p className="text-xs text-text-secondary">
              Stop-loss on losses; trailing stop after min profit; strategy sells after{" "}
              {settings.riskManagement.takeProfitPercent}% gate (paper cron only)
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
        </>
      )}

      {activeTab === "general" && (
        <>
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
              Email alerts for paper scans, live signals, and risk exits
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
            {
              key: "weeklyShortlist" as const,
              label: "Weekly shortlist email",
              desc: "Sunday summary of shortlisted shares — why bought and why not (18:00 IST)",
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
        </>
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
