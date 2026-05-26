import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAllAccountIds, getAccountApiKey } from "@/lib/zerodha/account-token";

export async function GET(request: NextRequest) {
  const accountIds = getAllAccountIds(request);

  // Also check legacy cookie if no per-account cookies exist
  if (accountIds.length === 0) {
    const legacyToken = request.cookies.get("kite_access_token")?.value;
    const legacyUserId = request.cookies.get("kite_user_id")?.value;
    const apiKey = getAccountApiKey(request, legacyUserId);
    if (legacyToken && legacyUserId && apiKey) {
      try {
        const kite = new KiteConnect({ api_key: apiKey });
        kite.setAccessToken(legacyToken);
        const profile = await kite.getProfile();
        return NextResponse.json({
          accounts: [
            {
              kiteUserId: profile.user_id || legacyUserId,
              userName: profile.user_name || "",
              email: profile.email || "",
              broker: profile.broker || "",
              connected: true,
            },
          ],
        });
      } catch {
        return NextResponse.json({
          accounts: [
            {
              kiteUserId: legacyUserId,
              connected: true,
              profileError: true,
            },
          ],
        });
      }
    }
    return NextResponse.json({ accounts: [] });
  }

  const accounts = await Promise.all(
    accountIds.map(async (id) => {
      const token = request.cookies.get(`kite_token_${id}`)?.value;
      const apiKey = getAccountApiKey(request, id);
      if (!token || !apiKey) return { kiteUserId: id, connected: false };

      try {
        const kite = new KiteConnect({ api_key: apiKey });
        kite.setAccessToken(token);
        const profile = await kite.getProfile();
        return {
          kiteUserId: profile.user_id || id,
          userName: profile.user_name || "",
          email: profile.email || "",
          broker: profile.broker || "",
          connected: true,
        };
      } catch {
        return { kiteUserId: id, connected: true, profileError: true };
      }
    })
  );

  return NextResponse.json({ accounts });
}
