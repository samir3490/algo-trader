import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { AppSettings } from "@/lib/firebase";
import {
  evaluatePositionRiskExit,
  holdingPnlPercent,
  type RiskExitSignal,
} from "@/lib/risk/paper-risk-guard";
import type { PaperPosition } from "@/lib/portfolio/types";
import {
  findSellLot,
  lotsFromKiteHoldings,
  lotsFromKitePositions,
  type BrokerLot,
} from "@/lib/live-trading/broker-lots";
import { loadLiveBook } from "@/lib/live-trading/live-book";
import { placeLiveAlgoOrder } from "@/lib/live-trading/place-live-algo-order";
import { isLiveRuleOn } from "@/lib/settings/live-rules";
import { fetchYahooQuote } from "@/lib/market-data/yahoo";

export interface LiveRiskExitResult {
  exits: (RiskExitSignal & { qty?: number; price?: number; orderId?: string })[];
  skips: { symbol: string; message: string }[];
  peaksUpdated: number;
}

function asPosition(
  lot: BrokerLot,
  peakPrice: number,
  entryTime?: string
): PaperPosition {
  return {
    id: `live:${lot.symbol}:${lot.product}`,
    symbol: lot.symbol,
    exchange: lot.exchange,
    quantity: lot.qty,
    entryPrice: lot.avgPrice,
    ltp: lot.ltp,
    peakPrice: Math.max(peakPrice, lot.ltp, lot.avgPrice),
    entryTime: entryTime || new Date(0).toISOString(),
    product: lot.product,
    ownerStrategyId: "live_risk",
    ownerStrategyName: "Live risk exit",
    state: "OPEN",
  };
}

async function loadAlgoPeaks(
  db: Firestore,
  userId: string
): Promise<Record<string, number>> {
  const snap = await db.doc(`users/${userId}/data/liveTrading`).get();
  const raw = snap.exists
    ? (snap.data() as { algoPeakPrices?: Record<string, number> }).algoPeakPrices
    : undefined;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n;
  }
  return out;
}

async function saveAlgoPeaks(
  db: Firestore,
  userId: string,
  peaks: Record<string, number>
): Promise<void> {
  await db.doc(`users/${userId}/data/liveTrading`).set(
    {
      algoPeakPrices: peaks,
      algoPeaksUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function refreshLotLtp(lot: BrokerLot): Promise<BrokerLot> {
  if (lot.ltp > 0) return lot;
  try {
    const q = await fetchYahooQuote(lot.symbol, lot.exchange);
    if (q?.lastPrice && q.lastPrice > 0) {
      return { ...lot, ltp: q.lastPrice };
    }
  } catch {
    /* keep avg */
  }
  return { ...lot, ltp: lot.ltp > 0 ? lot.ltp : lot.avgPrice };
}

/**
 * Independently evaluate stop / trail / take-profit on live algo open symbols
 * using Zerodha holdings (incl. T1) and positions — does not depend on paper.
 */
export async function applyLiveRiskExits(
  db: Firestore,
  userId: string,
  settings: AppSettings,
  options?: {
    /** Symbols already sold live this run (skip duplicate). */
    alreadySold?: Set<string>;
    now?: Date;
  }
): Promise<LiveRiskExitResult> {
  const exits: LiveRiskExitResult["exits"] = [];
  const skips: LiveRiskExitResult["skips"] = [];

  if (!isLiveRuleOn(settings, "liveAutoTradingEnabled")) {
    return { exits, skips, peaksUpdated: 0 };
  }

  const book = await loadLiveBook(db, userId);
  if (!book.ok || !book.kite) {
    skips.push({
      symbol: "*",
      message: book.message || "Live book unavailable for risk exits",
    });
    return { exits, skips, peaksUpdated: 0 };
  }

  const openSymbols = book.openSymbols;
  if (openSymbols.size === 0) {
    return { exits, skips, peaksUpdated: 0 };
  }

  let holdingsRaw: unknown = [];
  let positionsRaw: unknown = { net: [] };
  try {
    holdingsRaw = await book.kite.getHoldings();
  } catch {
    /* positions may still work */
  }
  try {
    positionsRaw = await book.kite.getPositions();
  } catch {
    /* ignore */
  }

  const lots: BrokerLot[] = [
    ...lotsFromKitePositions(positionsRaw),
    ...lotsFromKiteHoldings(holdingsRaw),
  ];

  const peaks = await loadAlgoPeaks(db, userId);
  let peaksDirty = false;
  const already = options?.alreadySold ?? new Set<string>();
  const product = settings.defaultProduct || "CNC";
  const now = options?.now ?? new Date();

  for (const sym of openSymbols) {
    if (already.has(sym)) continue;

    const lot = findSellLot(lots, sym, product);
    if (!lot) {
      skips.push({
        symbol: sym,
        message: `Live risk: no broker lot for ${sym} (check T1/holdings)`,
      });
      continue;
    }

    let priced = await refreshLotLtp(lot);
    const prevPeak = peaks[sym] ?? priced.avgPrice;
    const nextPeak = Math.max(prevPeak, priced.ltp, priced.avgPrice);
    if (nextPeak > (peaks[sym] ?? 0)) {
      peaks[sym] = nextPeak;
      peaksDirty = true;
    }

    const position = asPosition(priced, peaks[sym] ?? nextPeak);
    const signal = evaluatePositionRiskExit(position, settings, now);
    if (!signal) continue;

    const liveSell = await placeLiveAlgoOrder(db, userId, {
      side: "SELL",
      symbol: priced.symbol,
      exchange: priced.exchange,
      price: priced.ltp,
      qty: priced.qty,
      product: priced.product || product,
      settings: {
        liveOrderNotional: settings.liveOrderNotional,
        liveCapitalLimit: settings.liveCapitalLimit,
        liveAutoTradingEnabled: true,
        liveRuleEnforceCapitalLimits: isLiveRuleOn(
          settings,
          "liveRuleEnforceCapitalLimits"
        ),
      },
      strategyName: "Live risk exit",
      reason: signal.message,
    });

    if (liveSell.ok) {
      already.add(sym);
      delete peaks[sym];
      peaksDirty = true;
      exits.push({
        ...signal,
        qty: liveSell.qty ?? priced.qty,
        price: priced.ltp,
        orderId: liveSell.orderId,
      });
    } else {
      skips.push({
        symbol: sym,
        message:
          liveSell.message ||
          `Live risk sell failed (${holdingPnlPercent(priced.avgPrice, priced.ltp).toFixed(2)}%)`,
      });
    }
  }

  if (peaksDirty) {
    await saveAlgoPeaks(db, userId, peaks);
  }

  return { exits, skips, peaksUpdated: peaksDirty ? 1 : 0 };
}
