import type { Firestore } from "firebase-admin/firestore";
import {
  evaluateLiveBuyLimits,
  qtyForLiveNotional,
  resolveLiveOrderNotional,
  type LiveCapitalSettings,
  type LiveHoldingLike,
  type LivePositionLike,
} from "@/lib/live-trading/capital-limits";
import {
  algoCapitalBook,
  loadLiveBook,
  recordLiveAlgoFill,
} from "@/lib/live-trading/live-book";
import { buildLiveOrderRecord } from "@/lib/live-trading/live-order-record";
import { persistPaperOrderAdmin } from "@/lib/portfolio/paper-order-record-server";
import { isLiveTradingEnabled } from "@/lib/core/config";
import { sendOrderEmail } from "@/lib/email";
import {
  extractProxyOrderId,
  isZerodhaProxyConfigured,
  placeOrderViaZerodhaProxy,
} from "@/lib/zerodha/place-order-proxy";
import {
  findSellLot,
  lotsFromKiteHoldings,
  lotsFromKitePositions,
} from "@/lib/live-trading/broker-lots";

export interface LiveAlgoOrderResult {
  ok: boolean;
  skipped?: boolean;
  orderId?: string;
  message?: string;
  qty?: number;
}

async function resolveLiveSellQty(
  kite: NonNullable<Awaited<ReturnType<typeof loadLiveBook>>["kite"]>,
  symbol: string,
  product?: string
): Promise<number> {
  const lots = [];
  try {
    lots.push(...lotsFromKitePositions(await kite.getPositions()));
  } catch {
    /* holdings may still work */
  }
  try {
    lots.push(...lotsFromKiteHoldings(await kite.getHoldings()));
  } catch {
    /* ignore */
  }
  const lot = findSellLot(lots, symbol, product);
  return lot?.qty ?? 0;
}

/** Place a live MARKET order for the first stored Kite account (algo path). */
export async function placeLiveAlgoOrder(
  db: Firestore,
  appUserId: string,
  input: {
    side: "BUY" | "SELL";
    symbol: string;
    exchange?: string;
    price: number;
    product?: string;
    settings: LiveCapitalSettings & {
      liveAutoTradingEnabled?: boolean;
      liveRuleEnforceCapitalLimits?: boolean;
    };
    /** For SELL, exact qty (or omit to use open live position/holding qty). */
    qty?: number;
    positions?: { qty?: number; avgPrice?: number; average_price?: number }[];
    holdings?: {
      qty?: number;
      quantity?: number;
      avgPrice?: number;
      average_price?: number;
      invested?: number;
    }[];
    strategyName?: string;
    reason?: string;
  }
): Promise<LiveAlgoOrderResult> {
  if (!isLiveTradingEnabled()) {
    return { ok: false, skipped: true, message: "ENABLE_LIVE_TRADING is off" };
  }
  if (input.settings.liveAutoTradingEnabled !== true) {
    return { ok: false, skipped: true, message: "Live auto trading switch is off" };
  }

  const book = await loadLiveBook(db, appUserId);
  if (!book.ok || !book.kite) {
    return {
      ok: false,
      skipped: true,
      message: book.message || "Could not load live broker book",
    };
  }

  const kite = book.kite;
  const price = Math.max(0, input.price);
  const product = input.product || "CNC";
  const notional = resolveLiveOrderNotional(input.settings);
  // Capital gate uses algo-only deployed ₹ (not full broker / paper book).
  const capitalBook =
    input.positions != null || input.holdings != null
      ? {
          positions: (input.positions ?? []).map((p) => ({
            qty: Number(p.qty) || 0,
            avgPrice: Number(p.avgPrice ?? p.average_price) || 0,
          })),
          holdings: (input.holdings ?? []).map((h) => ({
            qty: Number(h.qty ?? h.quantity) || 0,
            quantity: Number(h.quantity ?? h.qty) || 0,
            avgPrice: Number(h.avgPrice ?? h.average_price) || 0,
            invested: h.invested,
          })),
        }
      : algoCapitalBook(book.deployed);
  const positions: LivePositionLike[] = capitalBook.positions;
  const holdings: LiveHoldingLike[] = capitalBook.holdings;

  let qty =
    input.qty != null && input.qty > 0 ? Math.floor(input.qty) : 0;

  if (input.side === "BUY") {
    if (qty <= 0) {
      qty = qtyForLiveNotional(notional, price);
    }
  } else if (qty <= 0) {
    qty = await resolveLiveSellQty(kite, input.symbol, product);
    if (qty <= 0) {
      return {
        ok: false,
        skipped: true,
        message: `No live position/holding to sell for ${input.symbol.toUpperCase()} (checked positions + holdings incl. T1)`,
      };
    }
  }

  if (qty <= 0 || (input.side === "BUY" && price <= 0)) {
    return { ok: false, message: "Invalid live qty/price" };
  }

  if (input.side === "BUY" && input.settings.liveRuleEnforceCapitalLimits !== false) {
    const gate = evaluateLiveBuyLimits({
      side: "BUY",
      qty,
      price,
      settings: input.settings,
      positions,
      holdings,
    });
    if (!gate.ok) {
      return { ok: false, skipped: true, message: gate.error };
    }
    if (gate.remainingCapital < qty * price) {
      qty = qtyForLiveNotional(Math.min(notional, gate.remainingCapital), price);
      if (qty <= 0) {
        return {
          ok: false,
          skipped: true,
          message: gate.error || "No live capital left",
        };
      }
    }
  }

  const strategyTag = (input.strategyName || "Algo")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 20);
  const orderParams = {
    tradingsymbol: input.symbol.toUpperCase(),
    exchange: input.exchange || "NSE",
    transaction_type: input.side,
    order_type: "MARKET",
    quantity: qty,
    product,
    validity: "DAY",
    market_protection: -1,
    ...(strategyTag ? { tag: strategyTag } : {}),
  };

  try {
    let orderId: string | undefined;
    // Vercel IPs are blocked by Kite — always prefer the static-IP proxy when set.
    if (isZerodhaProxyConfigured() && book.apiKey && book.accessToken) {
      const proxyResult = await placeOrderViaZerodhaProxy(
        book.apiKey,
        book.accessToken,
        orderParams
      );
      orderId = extractProxyOrderId(proxyResult);
    } else {
      const result = await kite.placeOrder("regular", orderParams as any);
      orderId = result.order_id;
    }

    if (!orderId) {
      return { ok: false, message: "Live order placed but no order_id returned" };
    }

    await recordLiveAlgoFill(db, appUserId, {
      orderId,
      side: input.side,
      symbol: input.symbol,
      qty,
      price,
      kiteUserId: book.kiteUserId,
    });

    try {
      await persistPaperOrderAdmin(
        db,
        appUserId,
        buildLiveOrderRecord({
          orderId,
          symbol: input.symbol,
          exchange: input.exchange || "NSE",
          side: input.side,
          qty,
          price,
          product,
          strategyName: input.strategyName || "Live algo",
          reason: input.reason || `Algo live ${input.side}`,
        })
      );
    } catch (persistErr) {
      console.error("Live order history persist failed:", formatKiteError(persistErr));
    }

    // Await email so Vercel does not freeze the lambda before Gmail accepts it.
    try {
      await sendOrderEmail({
        mode: "LIVE",
        symbol: input.symbol.toUpperCase(),
        exchange: input.exchange || "NSE",
        side: input.side,
        quantity: qty,
        price,
        orderType: "MARKET",
        product,
        orderId,
        status: `LIVE ${input.side} EXECUTED`,
        accountId: book.kiteUserId,
        strategyName: input.strategyName,
        reason: input.reason || `Algo live ${input.side}`,
      });
    } catch (emailErr) {
      console.error("Live order email failed:", formatKiteError(emailErr));
    }

    return { ok: true, orderId, qty };
  } catch (e) {
    return { ok: false, message: formatKiteError(e) };
  }
}

function formatKiteError(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [
      o.message,
      o.error_type,
      o.status,
      o.error_code,
      o.error,
    ]
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v));
    if (parts.length) return parts.join(" · ").slice(0, 240);
    try {
      return JSON.stringify(e).slice(0, 240);
    } catch {
      /* ignore */
    }
  }
  return String(e);
}
