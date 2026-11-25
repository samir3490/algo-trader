import type { AppSettings } from "@/lib/firebase";

/** Catalog of paper-trading rules shown in Settings → Rules. */
export type PaperRuleKey =
  | "ruleFixedNotional1L"
  | "ruleBasicExits2and5"
  | "ruleMaxPositions25"
  | "ruleStrategySellsOff"
  | "ruleClearRebuyLocks"
  | "rulePreferStrongSectors"
  | "ruleMinBuySignals2"
  | "ruleAutoSeedUniverse"
  | "enableRegimeWeighting"
  | "enableEntryConnectedExits"
  | "notifyWeeklyShortlist"
  | "notifyEmailDigest"
  | "notifyRiskExits";

export interface PaperRuleDefinition {
  key: PaperRuleKey;
  category: string;
  label: string;
  description: string;
  /** Default when unset in Firestore. */
  defaultOn: boolean;
}

export const PAPER_RULE_CATALOG: PaperRuleDefinition[] = [
  {
    key: "ruleFixedNotional1L",
    category: "Sizing",
    label: "Fixed ₹1L buy size",
    description:
      "Every paper BUY uses about ₹1,00,000 notional (share count from live price). Turn off to use Paper Trading → order size / sizing mode.",
    defaultOn: true,
  },
  {
    key: "ruleBasicExits2and5",
    category: "Exits",
    label: "Basic exits (−2% stop / +2% & +5% trailing)",
    description:
      "Stop at −2%. Trailing arms at ~+2% (2% from peak) and again at ~+5% (2% from peak) — no hard +5% exit so winners keep running under a trail. Turn off to use Risk fields on the Paper tab.",
    defaultOn: true,
  },
  {
    key: "ruleMaxPositions25",
    category: "Portfolio",
    label: "Cap open positions at 10",
    description:
      "At most 10 open paper names (fewer, higher-conviction slots). Turn off to use Max positions from the Paper tab.",
    defaultOn: true,
  },
  {
    key: "ruleStrategySellsOff",
    category: "Exits",
    label: "Ignore strategy SELL signals",
    description:
      "Paper exits only via stop/target (and MIS square-off). Strategy SELL signals do not close positions. Turn off to allow strategy sells from Risk settings.",
    defaultOn: true,
  },
  {
    key: "ruleClearRebuyLocks",
    category: "Gates",
    label: "Clear rebuy / day locks each scan",
    description:
      "Zeros rebuy cooldown, same-day rebuy ban, and round-trip caps, and clears day-locks at the start of every scan so fills are not blocked. Leave off to enforce a 4h cooldown and same-day rebuy ban (recommended).",
    defaultOn: false,
  },
  {
    key: "rulePreferStrongSectors",
    category: "Ranking",
    label: "Strong sectors only for buys",
    description:
      "Buys only names in today's leading Nifty sectors. Skips lagging and unknown sectors, and skips all buys if sector data fails to load. Turn off to allow any sector, ranked by signal count / confidence.",
    defaultOn: true,
  },
  {
    key: "ruleMinBuySignals2",
    category: "Ranking",
    label: "Require 3+ strategy signals to buy",
    description:
      "When on, a paper BUY needs agreement from at least three strategies on the same symbol. Off by default so single- and two-strategy entries are allowed.",
    defaultOn: false,
  },
  {
    key: "ruleAutoSeedUniverse",
    category: "Universe",
    label: "Auto-seed Nifty 50 scanners",
    description:
      "If too few universe strategies are running, replace paper strategies with the full Nifty 50 scanner set so BUY signals appear. Turn off to keep only the strategies you started.",
    defaultOn: true,
  },
  {
    key: "enableRegimeWeighting",
    category: "Ranking",
    label: "Regime-weighted buys (Nifty ADX)",
    description:
      "Boosts or dampens strategy confidence using Nifty ADX trend vs mean-reversion regime.",
    defaultOn: true,
  },
  {
    key: "enableEntryConnectedExits",
    category: "Exits",
    label: "Entry-connected sell filters",
    description:
      "When strategy sells are on, only count SELL signals compatible with how the position was entered.",
    defaultOn: true,
  },
  {
    key: "notifyEmailDigest",
    category: "Email",
    label: "One email per scan (digest)",
    description:
      "Single summary email per strategy run instead of one email per stock.",
    defaultOn: true,
  },
  {
    key: "notifyRiskExits",
    category: "Email",
    label: "Include stop/target exits in emails",
    description: "Email when auto stop-loss or take-profit sells fire.",
    defaultOn: true,
  },
  {
    key: "notifyWeeklyShortlist",
    category: "Email",
    label: "Weekly shortlist email",
    description:
      "Sunday digest of shortlisted shares — why bought and why not, with sector context.",
    defaultOn: true,
  },
];

export function isPaperRuleOn(
  settings: Partial<AppSettings> | null | undefined,
  key: PaperRuleKey
): boolean {
  const def = PAPER_RULE_CATALOG.find((r) => r.key === key);
  const raw = settings?.[key as keyof AppSettings];
  if (typeof raw === "boolean") return raw;
  return def?.defaultOn ?? true;
}

export function paperRulesSnapshot(
  settings: Partial<AppSettings>
): Record<PaperRuleKey, boolean> {
  const out = {} as Record<PaperRuleKey, boolean>;
  for (const rule of PAPER_RULE_CATALOG) {
    out[rule.key] = isPaperRuleOn(settings, rule.key);
  }
  return out;
}
