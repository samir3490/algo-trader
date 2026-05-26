import { NextResponse } from "next/server";
import { getAllCredentials } from "@/lib/zerodha/credentials";

export async function GET() {
  const creds = getAllCredentials();
  return NextResponse.json({
    credentials: creds.map((c, i) => ({
      index: i,
      label: c.label,
      apiKeyPrefix: c.apiKey.slice(0, 4) + "****",
    })),
  });
}
