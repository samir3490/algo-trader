import type { AppSettings } from "@/lib/firebase";
import { PAPER_RULE_CATALOG, type PaperRuleKey } from "./paper-rules";

/**
 * Live-trading rules — full copy of Paper Rules plus live-only master/capital gates.
 * Defaults match paper so you can test on paper first, then turn the same rule on for live.
 */
export type LiveRuleKey =
  | "liveAutoTradingEnabled"
  | "liveRuleFixedOrderNotional"
  | "liveRuleBasicExits2and5"
  | "liveRuleMaxPositions10"
  | "liveRuleStrategySellsOff"
  | "liveRuleClearRebuyLocks"
  | "liveRulePreferStrongSectors"
  | "liveRuleMinBuySignals3"
  | "liveRuleAutoSeedUniverse"
  | "liveRuleRegimeWeighting"
  | "liveRuleEntryConnectedExits"
  | "liveRuleNotifyEmailDigest"
  | "liveRuleNotifyRiskExits"
  | "liveRuleNotifyWeeklyShortlist"
  | "liveRuleEnforceCapitalLimits";

export interface LiveRuleDefinition {
  key: LiveRuleKey;
  category: string;
  label: string;
  description: string;
  defaultOn: boolean;
  /** Matching paper rule when this is a 1:1 copy. */
  paperKey?: PaperRuleKey;
}

/** Paper rule → live rule key (same defaultOn as paper catalog). */
export const PAPER_TO_LIVE_RULE: Record<PaperRuleKey, LiveRuleKey> = {
  ruleFixedNotional1L: "liveRuleFixedOrderNotional",
  ruleBasicExits2and5: "liveRuleBasicExits2and5",
  ruleMaxPositions25: "liveRuleMaxPositions10",
  ruleStrategySellsOff: "liveRuleStrategySellsOff",
  ruleClearRebuyLocks: "liveRuleClearRebuyLocks",
  rulePreferStrongSectors: "liveRulePreferStrongSectors",
  ruleMinBuySignals2: "liveRuleMinBuySignals3",
  ruleAutoSeedUniverse: "liveRuleAutoSeedUniverse",
  enableRegimeWeighting: "liveRuleRegimeWeighting",
  enableEntryConnectedExits: "liveRuleEntryConnectedExits",
  notifyEmailDigest: "liveRuleNotifyEmailDigest",
  notifyRiskExits: "liveRuleNotifyRiskExits",
  notifyWeeklyShortlist: "liveRuleNotifyWeeklyShortlist",
};

function paperDefault(key: PaperRuleKey): boolean {
  return PAPER_RULE_CATALOG.find((r) => r.key === key)?.defaultOn ?? true;
}

export const LIVE_RULE_CATALOG: LiveRuleDefinition[] = [
  {
    key: "liveAutoTradingEnabled",
    category: "Master",
    label: "Automatic live trading",
    description:
      "Kill switch. When on (and ENABLE_LIVE_TRADING=true on the server), cron places real Zerodha orders. Off = paper-only. Test rules on Paper Rules first, then enable here.",
    defaultOn: false,
  },
  {
    key: "liveRuleFixedOrderNotional",
    category: "Sizing",
    label: "Fixed order size per trade",
    description:
      "Every live algo BUY uses Order size per trade from the Live Trading tab (default ₹5,000). Same idea as paper’s fixed ₹1L rule — amount is live capital, not paper. Turn off only if you change sizing elsewhere.",
    defaultOn: paperDefault("ruleFixedNotional1L"),
    paperKey: "ruleFixedNotional1L",
  },
  {
    key: "liveRuleEnforceCapitalLimits",
    category: "Sizing",
    label: "Enforce ₹ capital + per-trade limits",
    description:
      "Block live buys that exceed Total capital limit or Order size per trade. Live-only safety (paper has its own ₹ caps).",
    defaultOn: true,
  },
  {
    key: "liveRuleBasicExits2and5",
    category: "Exits",
    label: "Basic exits (−2% stop / +5% target + trail)",
    description:
      "Live stop at −2%, hard target at +5%, 1.5% trail arming ~+2%. Same default as paper. Turn off to use Live Trading risk fields.",
    defaultOn: paperDefault("ruleBasicExits2and5"),
    paperKey: "ruleBasicExits2and5",
  },
  {
    key: "liveRuleMaxPositions10",
    category: "Portfolio",
    label: "Cap open positions at 10",
    description:
      "At most 10 open live algo names (same default as paper). Turn off to use Live max positions field.",
    defaultOn: paperDefault("ruleMaxPositions25"),
    paperKey: "ruleMaxPositions25",
  },
  {
    key: "liveRuleStrategySellsOff",
    category: "Exits",
    label: "Ignore strategy SELL signals",
    description:
      "Live exits only via stop/target. Strategy SELL signals do not close live positions. Same default as paper.",
    defaultOn: paperDefault("ruleStrategySellsOff"),
    paperKey: "ruleStrategySellsOff",
  },
  {
    key: "liveRuleClearRebuyLocks",
    category: "Gates",
    label: "Clear rebuy / day locks each scan",
    description:
      "Leave off to enforce rebuy cooldown / same-day ban (recommended, same as paper). On = allow immediate rebuy after stops.",
    defaultOn: paperDefault("ruleClearRebuyLocks"),
    paperKey: "ruleClearRebuyLocks",
  },
  {
    key: "liveRulePreferStrongSectors",
    category: "Ranking",
    label: "Strong sectors only for buys",
    description:
      "Live buys only in leading Nifty sectors; skip when sector data is missing. Same default as paper.",
    defaultOn: paperDefault("rulePreferStrongSectors"),
    paperKey: "rulePreferStrongSectors",
  },
  {
    key: "liveRuleMinBuySignals3",
    category: "Ranking",
    label: "Require 3+ strategy signals to buy",
    description:
      "Live BUY needs agreement from at least three strategies. Same default as paper.",
    defaultOn: paperDefault("ruleMinBuySignals2"),
    paperKey: "ruleMinBuySignals2",
  },
  {
    key: "liveRuleAutoSeedUniverse",
    category: "Universe",
    label: "Auto-seed Nifty 50 scanners",
    description:
      "Same idea as paper: keep the shared scanner universe seeded so live signals appear. Independent toggle for future live-only universe control.",
    defaultOn: paperDefault("ruleAutoSeedUniverse"),
    paperKey: "ruleAutoSeedUniverse",
  },
  {
    key: "liveRuleRegimeWeighting",
    category: "Ranking",
    label: "Regime-weighted buys (Nifty ADX)",
    description:
      "Boosts or dampens live buy confidence using Nifty ADX. Same default as paper; change here without touching Paper Rules.",
    defaultOn: paperDefault("enableRegimeWeighting"),
    paperKey: "enableRegimeWeighting",
  },
  {
    key: "liveRuleEntryConnectedExits",
    category: "Exits",
    label: "Entry-connected sell filters",
    description:
      "When live strategy sells are on, only count SELL signals compatible with entry. Same default as paper.",
    defaultOn: paperDefault("enableEntryConnectedExits"),
    paperKey: "enableEntryConnectedExits",
  },
  {
    key: "liveRuleNotifyEmailDigest",
    category: "Email",
    label: "One email per scan (digest)",
    description:
      "Include live fills in the scan digest email. Same default as paper; independent so you can mute live noise while testing.",
    defaultOn: paperDefault("notifyEmailDigest"),
    paperKey: "notifyEmailDigest",
  },
  {
    key: "liveRuleNotifyRiskExits",
    category: "Email",
    label: "Include stop/target exits in emails",
    description:
      "Email when live stop-loss or take-profit sells fire. Same default as paper.",
    defaultOn: paperDefault("notifyRiskExits"),
    paperKey: "notifyRiskExits",
  },
  {
    key: "liveRuleNotifyWeeklyShortlist",
    category: "Email",
    label: "Weekly shortlist email",
    description:
      "Include live context in the weekly shortlist digest when available. Same default as paper.",
    defaultOn: paperDefault("notifyWeeklyShortlist"),
    paperKey: "notifyWeeklyShortlist",
  },
];

export function isLiveRuleOn(
  settings: Partial<AppSettings> | null | undefined,
  key: LiveRuleKey
): boolean {
  const def = LIVE_RULE_CATALOG.find((r) => r.key === key);
  const raw = settings?.[key as keyof AppSettings];
  if (typeof raw === "boolean") return raw;
  return def?.defaultOn ?? false;
}

export function liveRulesSnapshot(
  settings: Partial<AppSettings>
): Record<LiveRuleKey, boolean> {
  const out = {} as Record<LiveRuleKey, boolean>;
  for (const rule of LIVE_RULE_CATALOG) {
    out[rule.key] = isLiveRuleOn(settings, rule.key);
  }
  return out;
}
