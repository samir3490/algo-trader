import type { AppSettings } from "@/lib/firebase";

/** Catalog of paper-trading rules shown in Settings → Rules. */
export type PaperRuleKey =
  | "ruleFixedNotional1L"
  | "ruleBasicExits2and5"
  | "ruleMaxPositions25"
  | "ruleStrategySellsOff"
  | "ruleClearRebuyLocks"
  | "rulePreferStrongSectors"
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
    label: "Basic exits (−2% stop / +5% target + trail)",
    description:
      "Stop at −2%, hard target at +5%, and a 1.5% trailing stop that arms after about +2% so winners are not given back. Turn off to use Risk fields on the Paper tab.",
    defaultOn: true,
  },
  {
    key: "ruleMaxPositions25",
    category: "Portfolio",
    label: "Cap open positions at 25",
    description:
      "At most 25 open paper names. Turn off to use Max positions from the Paper tab.",
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
      "Zeros rebuy cooldown, same-day rebuy ban, and round-trip caps, and clears day-locks at the start of every scan so fills are not blocked. Turn off to enforce cooldown settings from the Paper tab.",
    defaultOn: true,
  },
  {
    key: "rulePreferStrongSectors",
    category: "Ranking",
    label: "Prefer strong sectors for buys",
    description:
      "Ranks BUY candidates by Nifty sector performance first (strong sectors before lagging). Turn off to rank by signal count / confidence only.",
    defaultOn: true,
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
