import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { sendOrderEmail } from "@/lib/email";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";
import {
  assertLiveTradingEnabled,
  LiveTradingDisabledError,
} from "@/lib/core/live-trading-guard";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { assertLiveBuyWithinLimits } from "@/lib/live-trading/enforce-live-buy";
import {
  extractProxyOrderId,
  placeOrderViaZerodhaProxy,
} from "@/lib/zerodha/place-order-proxy";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const orders = await kite.getOrders();
    return NextResponse.json({ orders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertLiveTradingEnabled();
  } catch (e) {
    if (e instanceof LiveTradingDisabledError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const body = await request.json();
  const accountId = body.accountId as string | undefined;
  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const orderType = body.orderType || "MARKET";
    const side = (body.side || "BUY") as "BUY" | "SELL";
    const qty = Number(body.quantity) || 0;
    const estimatedPrice =
      Number(body.price) ||
      Number(body.estimatedPrice) ||
      Number(body.triggerPrice) ||
      0;
    const shouldSetMarketProtection = orderType === "MARKET" || orderType === "SL-M";
    // Kite rejects MARKET (and SL-M) orders if market_protection is 0/absent.
    // -1 enables automatic market protection as per Kite guidelines.
    const marketProtection = shouldSetMarketProtection ? -1 : undefined;

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    if (side === "BUY" && isFirebaseAdminConfigured()) {
      const gate = await assertLiveBuyWithinLimits({
        db: getAdminFirestore(),
        kite,
        side,
        qty,
        estimatedPrice,
      });
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 400 });
      }
    }

    const orderParams = {
      tradingsymbol: body.symbol,
      exchange: body.exchange || "NSE",
      transaction_type: side,
      order_type: orderType,
      quantity: body.quantity,
      price: body.price,
      trigger_price: body.triggerPrice,
      product: body.product || "MIS",
      validity: body.validity || "DAY",
      ...(marketProtection !== undefined ? { market_protection: marketProtection } : {}),
    };

    let orderId: string | undefined;

    if (process.env.ZERODHA_PROXY_URL) {
      const result = await placeOrderViaZerodhaProxy(
        apiKey,
        accessToken,
        orderParams
      );
      orderId = extractProxyOrderId(result);
    } else {
      const result = await kite.placeOrder("regular", orderParams as any);
      orderId = result.order_id;
    }

    try {
      await sendOrderEmail({
        mode: "LIVE",
        symbol: orderParams.tradingsymbol,
        exchange: orderParams.exchange,
        side: orderParams.transaction_type as "BUY" | "SELL",
        quantity: Number(orderParams.quantity),
        price: Number(orderParams.price) || 0,
        orderType: orderParams.order_type,
        product: orderParams.product,
        orderId,
        status: "PLACED",
        accountId: accountId || undefined,
      });
    } catch (emailErr) {
      console.error("Live manual order email failed:", emailErr);
    }

    return NextResponse.json({ orderId, status: "success" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
