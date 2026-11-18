import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

export interface StoredKiteToken {
  kiteUserId: string;
  apiKey: string;
  accessToken: string;
  updatedAt?: string;
}

function encryptionKey(): Buffer {
  const raw =
    process.env.KITE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "algo-trader-dev-token-key";
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptToken(payload: string): string {
  if (!payload.startsWith("v1:")) return payload;
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function tokenDoc(db: Firestore, appUserId: string, kiteUserId: string) {
  return db.doc(`users/${appUserId}/zerodha_tokens/${kiteUserId}`);
}

/** Persist access token for cron / server-side live auto-trading. */
export async function saveServerKiteToken(
  db: Firestore,
  appUserId: string,
  input: { kiteUserId: string; apiKey: string; accessToken: string }
): Promise<void> {
  await tokenDoc(db, appUserId, input.kiteUserId).set(
    {
      kiteUserId: input.kiteUserId,
      apiKey: input.apiKey,
      accessTokenEnc: encryptToken(input.accessToken),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadServerKiteToken(
  db: Firestore,
  appUserId: string,
  kiteUserId: string
): Promise<StoredKiteToken | null> {
  const snap = await tokenDoc(db, appUserId, kiteUserId).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const enc = String(data.accessTokenEnc || data.accessToken || "");
  if (!enc) return null;
  try {
    return {
      kiteUserId: String(data.kiteUserId || kiteUserId),
      apiKey: String(data.apiKey || ""),
      accessToken: decryptToken(enc),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.(),
    };
  } catch {
    return null;
  }
}

export async function listServerKiteTokens(
  db: Firestore,
  appUserId: string
): Promise<StoredKiteToken[]> {
  const snap = await db.collection(`users/${appUserId}/zerodha_tokens`).get();
  const out: StoredKiteToken[] = [];
  for (const doc of snap.docs) {
    const loaded = await loadServerKiteToken(db, appUserId, doc.id);
    if (loaded?.accessToken && loaded.apiKey) out.push(loaded);
  }
  return out;
}

export async function deleteServerKiteToken(
  db: Firestore,
  appUserId: string,
  kiteUserId: string
): Promise<void> {
  await tokenDoc(db, appUserId, kiteUserId).delete();
}
