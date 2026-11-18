import { NextRequest, NextResponse } from "next/server";
import { sendOrderEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false as const, status: 503, error: "CRON_SECRET missing" };
  }
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : auth;
  if (!token || token !== secret) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  return { ok: true as const };
}

/** Resend / verify LIVE order email path (no broker order). */
export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const configured = {
    EMAIL_USER: Boolean(process.env.EMAIL_USER?.trim()),
    EMAIL_APP_PASSWORD: Boolean(process.env.EMAIL_APP_PASSWORD?.trim()),
    EMAIL_RECIPIENT: Boolean(
      process.env.EMAIL_RECIPIENT?.trim() || process.env.EMAIL_USER?.trim()
    ),
  };

  if (
    !configured.EMAIL_USER ||
    !configured.EMAIL_APP_PASSWORD ||
    !configured.EMAIL_RECIPIENT
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Email env not fully configured on Vercel",
        configured,
      },
      { status: 503 }
    );
  }

  const symbol = (
    request.nextUrl.searchParams.get("symbol") || "SBIN"
  ).toUpperCase();
  const orderId =
    request.nextUrl.searchParams.get("orderId") || "261118151237399";
  const qty = Number(request.nextUrl.searchParams.get("qty") || 1);
  const price = Number(request.nextUrl.searchParams.get("price") || 1140.05);

  try {
    await sendOrderEmail({
      mode: "LIVE",
      symbol,
      exchange: "NSE",
      side: "BUY",
      quantity: qty,
      price,
      orderType: "MARKET",
      product: "CNC",
      orderId,
      status: "LIVE BUY EXECUTED",
      strategyName: "Live smoke test (email retry)",
      reason:
        "Resent notification for today's smoke BUY — verifying live email delivery",
    });
    return NextResponse.json({
      ok: true,
      sentTo: process.env.EMAIL_RECIPIENT || process.env.EMAIL_USER,
      symbol,
      orderId,
      configured,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        configured,
      },
      { status: 500 }
    );
  }
}
