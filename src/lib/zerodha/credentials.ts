export interface KiteCredential {
  apiKey: string;
  apiSecret: string;
  label: string;
}

/**
 * Parse KITE_CREDENTIALS env var (JSON array) and fall back to
 * single KITE_API_KEY / KITE_API_SECRET for backward compatibility.
 *
 * Format: [{"apiKey":"xxx","apiSecret":"yyy","label":"Account 1"}, ...]
 */
export function getAllCredentials(): KiteCredential[] {
  const raw = process.env.KITE_CREDENTIALS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c: any, i: number) => ({
          apiKey: c.apiKey || c.api_key || "",
          apiSecret: c.apiSecret || c.api_secret || "",
          label: c.label || `App ${i + 1}`,
        }));
      }
    } catch {}
  }

  const key = process.env.KITE_API_KEY;
  const secret = process.env.KITE_API_SECRET;
  if (key && secret) {
    return [{ apiKey: key, apiSecret: secret, label: "Default" }];
  }

  return [];
}

export function getCredentialByApiKey(apiKey: string): KiteCredential | null {
  return getAllCredentials().find((c) => c.apiKey === apiKey) || null;
}

export function getCredentialByIndex(index: number): KiteCredential | null {
  const creds = getAllCredentials();
  return creds[index] || null;
}

export function getDefaultCredential(): KiteCredential | null {
  const creds = getAllCredentials();
  return creds[0] || null;
}
