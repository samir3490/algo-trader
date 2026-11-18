import { KiteConnect } from "kiteconnect";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  evaluateLiveBuyLimits,
  qtyForLiveNotional,
  resolveLiveOrderNotional,
  type LiveCapitalSettings,
} from "@/lib/live-trading/capital-limits";
import { listServerKiteTokens } from "@/lib/zerodha/server-token-store";
import { isLiveTradingEnabled } from "@/lib/core/config";

export interface LiveAlgoOrderResult {
  ok: boolean;
  skipped?: boolean;
  orderId?: string;
  message?: string;
  qty?: number;
}

async function resolveLiveSellQty(
  kite: InstanceType<typeof KiteConnect>,
  symbol: string,
  product?: string
): Promise<number> {
  const sym = symbol.toUpperCase();
  const prod = (product || "CNC").toUpperCase();
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
      const q = Number(h.quantity ?? h.qty ?? 0);
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
    positions?: { qty: number; avgPrice: number }[];
    holdings?: { qty: number; avgPrice: number; invested?: number }[];
  }
): Promise<LiveAlgoOrderResult> {
  if (!isLiveTradingEnabled()) {
    return { ok: false, skipped: true, message: "ENABLE_LIVE_TRADING is off" };
  }
  if (input.settings.liveAutoTradingEnabled !== true) {
    return { ok: false, skipped: true, message: "Live auto trading switch is off" };
  }

  const tokens = await listServerKiteTokens(db, appUserId);
  const token = tokens[0];
  if (!token) {
    return {
      ok: false,
      skipped: true,
      message: "No server Kite token — reconnect Zerodha in Settings",
    };
  }

  const price = Math.max(0, input.price);
  const product = input.product || "CNC";
  const notional = resolveLiveOrderNotional(input.settings);

  const kite = new KiteConnect({ api_key: token.apiKey });
  kite.setAccessToken(token.accessToken);

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
      positions: input.positions ?? [],
      holdings: input.holdings ?? [],
    });
    if (!gate.ok) {
      return { ok: false, skipped: true, message: gate.error };
    }
    if (gate.remainingCapital < qty * price) {
      qty = qtyForLiveNotional(Math.min(notional, gate.remainingCapital), price);
      if (qty <= 0) {
        return { ok: false, skipped: true, message: gate.error || "No live capital left" };
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
    await db
      .collection(`users/${appUserId}/data`)
      .doc("liveTrading")
      .set(
        {
          lastAlgoOrderAt: FieldValue.serverTimestamp(),
          lastAlgoOrder: {
            orderId,
            side: input.side,
            symbol: input.symbol.toUpperCase(),
            qty,
            price,
            kiteUserId: token.kiteUserId,
          },
        },
        { merge: true }
      );

    return { ok: true, orderId, qty };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}
