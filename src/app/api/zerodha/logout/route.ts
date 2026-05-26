import { NextRequest, NextResponse } from "next/server";
import { getAllAccountIds } from "@/lib/zerodha/account-token";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const accountId = body.accountId as string | undefined;

  const response = NextResponse.json({ message: "Logged out" });

  if (accountId) {
    // Disconnect a specific account
    response.cookies.delete(`kite_token_${accountId}`);

    // If this was also the legacy account, clear those too
    const legacyUserId = request.cookies.get("kite_user_id")?.value;
    if (legacyUserId === accountId) {
      response.cookies.delete("kite_access_token");
      response.cookies.delete("kite_user_id");
    }
  } else {
    // Disconnect all accounts
    const accountIds = getAllAccountIds(request);
    for (const id of accountIds) {
      response.cookies.delete(`kite_token_${id}`);
    }
    response.cookies.delete("kite_access_token");
    response.cookies.delete("kite_user_id");
  }

  return response;
}
