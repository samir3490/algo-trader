import { NextRequest, NextResponse } from "next/server";
import { getAllAccountIds, APIKEY_PREFIX } from "@/lib/zerodha/account-token";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const accountId = body.accountId as string | undefined;

  const response = NextResponse.json({ message: "Logged out" });

  if (accountId) {
    response.cookies.delete(`kite_token_${accountId}`);
    response.cookies.delete(`${APIKEY_PREFIX}${accountId}`);

    const legacyUserId = request.cookies.get("kite_user_id")?.value;
    if (legacyUserId === accountId) {
      response.cookies.delete("kite_access_token");
      response.cookies.delete("kite_user_id");
    }
  } else {
    const accountIds = getAllAccountIds(request);
    for (const id of accountIds) {
      response.cookies.delete(`kite_token_${id}`);
      response.cookies.delete(`${APIKEY_PREFIX}${id}`);
    }
    response.cookies.delete("kite_access_token");
    response.cookies.delete("kite_user_id");
  }

  return response;
}
