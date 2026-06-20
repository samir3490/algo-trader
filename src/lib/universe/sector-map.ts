import { TOP100_SYMBOLS } from "@/lib/universe/symbol-lists";
import type { SectorId } from "@/lib/universe/sectors";

/**
 * Symbol → Nifty sector bucket for Top 100 universe.
 * Sourced from NSE Nifty 50 / Next 50 constituent sector groupings.
 */
const SYMBOL_SECTOR: Record<string, SectorId> = {
  // ── Nifty 50 ──────────────────────────────────────────────────────────
  RELIANCE: "energy",
  TCS: "it",
  HDFCBANK: "bank",
  INFY: "it",
  ICICIBANK: "bank",
  HINDUNILVR: "fmcg",
  ITC: "fmcg",
  SBIN: "psu_bank",
  BHARTIARTL: "media",
  KOTAKBANK: "bank",
  LT: "infra",
  AXISBANK: "bank",
  ASIANPAINT: "fmcg",
  MARUTI: "auto",
  BAJFINANCE: "financial_services",
  TITAN: "fmcg",
  SUNPHARMA: "pharma",
  WIPRO: "it",
  ULTRACEMCO: "infra",
  HCLTECH: "it",
  TATAMOTORS: "auto",
  TATASTEEL: "metal",
  POWERGRID: "energy",
  NTPC: "energy",
  ONGC: "energy",
  JSWSTEEL: "metal",
  ADANIENT: "energy",
  ADANIPORTS: "infra",
  TECHM: "it",
  BAJAJFINSV: "financial_services",
  NESTLEIND: "fmcg",
  "M&M": "auto",
  HDFCLIFE: "financial_services",
  SBILIFE: "financial_services",
  DIVISLAB: "pharma",
  BRITANNIA: "fmcg",
  CIPLA: "pharma",
  DRREDDY: "pharma",
  EICHERMOT: "auto",
  APOLLOHOSP: "pharma",
  COALINDIA: "energy",
  BPCL: "energy",
  GRASIM: "infra",
  TATACONSUM: "fmcg",
  HEROMOTOCO: "auto",
  "BAJAJ-AUTO": "auto",
  INDUSINDBK: "bank",
  HINDALCO: "metal",
  LTIM: "it",
  SHRIRAMFIN: "financial_services",

  // ── Nifty Next 50 (Top 100) ───────────────────────────────────────────
  BANKBARODA: "psu_bank",
  VEDL: "metal",
  HAVELLS: "fmcg",
  GODREJCP: "fmcg",
  DLF: "realty",
  SIEMENS: "infra",
  ABB: "infra",
  DABUR: "fmcg",
  PIDILITIND: "fmcg",
  AMBUJACEM: "infra",
  INDIGO: "auto",
  ICICIPRULI: "financial_services",
  MARICO: "fmcg",
  TATAPOWER: "energy",
  IOC: "energy",
  NAUKRI: "it",
  CHOLAFIN: "financial_services",
  BERGEPAINT: "fmcg",
  BOSCHLTD: "auto",
  COLPAL: "fmcg",
  TORRETPHARM: "pharma",
  SRF: "pharma",
  INDUSTOWER: "media",
  HAL: "infra",
  "MCDOWELL-N": "fmcg",
  PFC: "financial_services",
  RECLTD: "financial_services",
  GAIL: "energy",
  JINDALSTEL: "metal",
  SAIL: "metal",
  TRENT: "fmcg",
  BEL: "infra",
  MUTHOOTFIN: "financial_services",
  CANBK: "psu_bank",
  PNB: "psu_bank",
  MAXHEALTH: "pharma",
  ZOMATO: "it",
  PAYTM: "financial_services",
  POLICYBZR: "financial_services",
  DMART: "fmcg",
  ADANIGREEN: "energy",
  ATGL: "energy",
  JIOFIN: "financial_services",
  LICI: "financial_services",
  IRFC: "financial_services",
  LODHA: "realty",
  YESBANK: "bank",
  UNIONBANK: "psu_bank",
  UPL: "fmcg",
  ICICIGI: "financial_services",
};

export function getSectorForSymbol(symbol: string): SectorId | null {
  return SYMBOL_SECTOR[symbol.toUpperCase()] ?? null;
}

export function getSymbolsForSector(sectorId: SectorId): string[] {
  return TOP100_SYMBOLS.filter((sym) => SYMBOL_SECTOR[sym] === sectorId);
}

export function sectorMapCoverage(): {
  mapped: number;
  total: number;
  unmapped: string[];
} {
  const unmapped = TOP100_SYMBOLS.filter((sym) => !SYMBOL_SECTOR[sym]);
  return {
    mapped: TOP100_SYMBOLS.length - unmapped.length,
    total: TOP100_SYMBOLS.length,
    unmapped,
  };
}
