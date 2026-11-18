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
  loadLiveBook,
  recordLiveAlgoFill,
} from "@/lib/live-trading/live-book";
import { isLiveTradingEnabled } from "@/lib/core/config";

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
  product?: string,
  book?: Awaited<ReturnType<typeof loadLiveBook>>
): Promise<number> {
  const sym = symbol.toUpperCase();
  const prod = (product || "CNC").toUpperCase();

  if (book?.ok) {
    // Prefer fresh book quantities when available (already aggregated).
    for (const p of book.positions) {
      if ((p.qty ?? 0) > 0 && book.openSymbols.has(sym)) {
        /* positions list has no symbol — fall through to kite */
        break;
      }
    }
  }

  try {
    const positions = await kite.getPositions();
    const net = (positions as { net?: any[] })?.net ?? [];
    for (const p of net) {
      if (String(p.tradingsymbol || "").toUpperCase() !== sym) continue;
      if (prod && String(p.product || "").toUpperCase() !== prod) continue;
      const q = Number(p.quantity ?? 0);
      if (q > 0) return Math.floor(q);
    }
    for (const p of net) {
      if (String(p.tradingsymbol || "").toUpperCase() !== sym) continue;
      const q = Number(p.quantity ?? 0);
      if (q > 0) return Math.floor(q);
    }
  } catch {
    /* try holdings */
  }
  try {
    const holdings = await kite.getHoldings();
    const list = Array.isArray(holdings) ? holdings : [];
    for (const h of list) {
      if (String(h.tradingsymbol || "").toUpperCase() !== sym) continue;
      const q = Number(
        (h as { quantity?: number; qty?: number }).quantity ??
          (h as { quantity?: number; qty?: number }).qty ??
          0
      );
      if (q > 0) return Math.floor(q);
    }
  } catch {
    /* ignore */
  }
  return 0;
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
  const positions: LivePositionLike[] = (input.positions ?? book.positions).map(
    (p) => ({
      qty: Number(p.qty) || 0,
      avgPrice: Number(p.avgPrice ?? p.average_price) || 0,
    })
  );
  const holdings: LiveHoldingLike[] = (input.holdings ?? book.holdings).map(
    (h) => ({
      qty: Number(h.qty ?? h.quantity) || 0,
      quantity: Number(h.quantity ?? h.qty) || 0,
      avgPrice: Number(h.avgPrice ?? h.average_price) || 0,
      invested: h.invested,
    })
  );

  let qty =
    input.qty != null && input.qty > 0 ? Math.floor(input.qty) : 0;

  if (input.side === "BUY") {
    if (qty <= 0) {
      qty = qtyForLiveNotional(notional, price);
    }
  } else if (qty <= 0) {
    qty = await resolveLiveSellQty(kite, input.symbol, product, book);
    if (qty <= 0) {
      return {
        ok: false,
        skipped: true,
        message: `No live position/holding to sell for ${input.symbol.toUpperCase()}`,
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

  try {
    const result = await kite.placeOrder("regular", {
      tradingsymbol: input.symbol.toUpperCase(),
      exchange: input.exchange || "NSE",
      transaction_type: input.side,
      order_type: "MARKET",
      quantity: qty,
      product,
      validity: "DAY",
      market_protection: -1,
    } as any);

    const orderId = result.order_id;
    await recordLiveAlgoFill(db, appUserId, {
      orderId,
      side: input.side,
      symbol: input.symbol,
      qty,
      price,
      kiteUserId: book.kiteUserId,
    });

    return { ok: true, orderId, qty };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}
