"use client";

import type { User } from "firebase/auth";

/** Fetch Zerodha API routes with Firebase Bearer so server can use stored tokens. */
export async function zerodhaFetch(
  user: User | null | undefined,
  input: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      /* ignore — cookie session may still work */
    }
  }
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
