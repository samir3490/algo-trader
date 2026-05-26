import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("kite_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
    kite.setAccessToken(accessToken);
    const orders = await kite.getOrders();
    return NextResponse.json({ orders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get("kite_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
    kite.setAccessToken(accessToken);

    const result = await kite.placeOrder("regular", {
      tradingsymbol: body.symbol,
      exchange: body.exchange || "NSE",
      transaction_type: body.side,
      order_type: body.orderType || "MARKET",
      quantity: body.quantity,
      price: body.price,
      trigger_price: body.triggerPrice,
      product: body.product || "MIS",
      validity: body.validity || "DAY",
    });

    return NextResponse.json({ orderId: result.order_id, status: "success" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
