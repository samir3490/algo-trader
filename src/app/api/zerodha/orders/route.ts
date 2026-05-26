import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { sendOrderEmail } from "@/lib/email";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";

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

async function placeOrderViaProxy(
  apiKey: string,
  accessToken: string,
  params: Record<string, any>
): Promise<any> {
  const proxyUrl = process.env.ZERODHA_PROXY_URL;
  const proxySecret = process.env.ZERODHA_PROXY_SECRET;

  if (!proxyUrl || !proxySecret) {
    throw new Error(
      "Order proxy not configured. Set ZERODHA_PROXY_URL and ZERODHA_PROXY_SECRET environment variables."
    );
  }

  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Secret": proxySecret,
    },
    body: JSON.stringify({
      action: "place_order",
      api_key: apiKey,
      access_token: accessToken,
      variety: "regular",
      params,
    }),
  });

  const responseText = await res.text();

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Proxy returned invalid response (HTTP ${res.status}). ` +
      `URL: ${proxyUrl} — Response: ${responseText.substring(0, 200)}`
    );
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Proxy error (${res.status})`);
  }

  return data;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const accountId = body.accountId as string | undefined;
  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const orderParams = {
      tradingsymbol: body.symbol,
      exchange: body.exchange || "NSE",
      transaction_type: body.side,
      order_type: body.orderType || "MARKET",
      quantity: body.quantity,
      price: body.price,
      trigger_price: body.triggerPrice,
      product: body.product || "MIS",
      validity: body.validity || "DAY",
    };

    let orderId: string | undefined;

    if (process.env.ZERODHA_PROXY_URL) {
      const result = await placeOrderViaProxy(apiKey, accessToken, orderParams);
      orderId = result?.data?.order_id;
    } else {
      const kite = new KiteConnect({ api_key: apiKey });
      kite.setAccessToken(accessToken);
      const result = await kite.placeOrder("regular", orderParams as any);
      orderId = result.order_id;
    }

    sendOrderEmail({
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
    }).catch(() => {});

    return NextResponse.json({ orderId, status: "success" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
