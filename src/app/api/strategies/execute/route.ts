import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { runStrategiesForUser } from "@/lib/strategies/run-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Run strategies for the logged-in user (manual trigger from the app). */
export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Server strategy runner is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on Vercel.",
      },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const result = await runStrategiesForUser(decoded.uid);
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Execute failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
