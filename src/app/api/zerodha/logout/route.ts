import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out" });
  response.cookies.delete("kite_access_token");
  response.cookies.delete("kite_user_id");
  return response;
}
