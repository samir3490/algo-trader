import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Returns the git commit Vercel built — use to confirm production matches GitHub master. */
export async function GET() {
  return NextResponse.json({
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      "local",
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    deployedAt: new Date().toISOString(),
  });
}
