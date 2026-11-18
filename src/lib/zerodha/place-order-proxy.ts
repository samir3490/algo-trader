/** Place a Kite order via the static-IP Zerodha proxy (required for Vercel). */

export async function placeOrderViaZerodhaProxy(
  apiKey: string,
  accessToken: string,
  params: Record<string, unknown>
): Promise<{ order_id?: string; data?: { order_id?: string } }> {
  const proxyUrl = process.env.ZERODHA_PROXY_URL?.trim();
  const proxySecret = process.env.ZERODHA_PROXY_SECRET?.trim();

  if (!proxyUrl || !proxySecret) {
    throw new Error(
      "Order proxy not configured. Set ZERODHA_PROXY_URL and ZERODHA_PROXY_SECRET."
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
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Proxy returned invalid response (HTTP ${res.status}). ` +
        `Response: ${responseText.substring(0, 200)}`
    );
  }

  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || `Proxy error (${res.status})`
    );
  }

  return data;
}

export function isZerodhaProxyConfigured(): boolean {
  return Boolean(
    process.env.ZERODHA_PROXY_URL?.trim() &&
      process.env.ZERODHA_PROXY_SECRET?.trim()
  );
}

export function extractProxyOrderId(result: {
  order_id?: string;
  data?: { order_id?: string };
}): string | undefined {
  return result?.order_id || result?.data?.order_id;
}
