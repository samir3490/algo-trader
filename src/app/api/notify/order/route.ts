import { NextRequest, NextResponse } from "next/server";
import { sendOrderEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.skipEmail === true) {
      return NextResponse.json({ sent: false, skipped: true });
    }

    await sendOrderEmail({
      mode: body.mode || "PAPER",
      symbol: body.symbol,
      exchange: body.exchange || "NSE",
      side: body.side,
      quantity: Number(body.quantity),
      price: Number(body.price),
      orderType: body.orderType || "MARKET",
      product: body.product || "CNC",
      status: "EXECUTED",
    });

    return NextResponse.json({ sent: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
