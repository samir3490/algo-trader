import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";

async function cancelOrderViaProxy(
  apiKey: string,
  accessToken: string,
  orderId: string,
  variety: string
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
      action: "cancel_order",
      api_key: apiKey,
      access_token: accessToken,
      variety,
      order_id: orderId,
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
    const { orderId, variety = "regular" } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    if (process.env.ZERODHA_PROXY_URL) {
      const result = await cancelOrderViaProxy(apiKey, accessToken, orderId, variety);
      return NextResponse.json({
        orderId: result?.data?.order_id || orderId,
        status: "success",
      });
    }

    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const result = await kite.cancelOrder(variety, orderId);
    return NextResponse.json({ orderId: result.order_id, status: "success" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
