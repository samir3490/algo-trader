export type SectorId =
  | "bank"
  | "psu_bank"
  | "it"
  | "auto"
  | "fmcg"
  | "pharma"
  | "metal"
  | "energy"
  | "realty"
  | "financial_services"
  | "media"
  | "infra";

export interface NiftySector {
  id: SectorId;
  name: string;
  /** Yahoo Finance ticker for the Nifty sectoral index */
  yahooSymbol: string;
}

/** Nifty sectoral indices — verify tickers if Yahoo returns empty quotes */
export const NIFTY_SECTORS: NiftySector[] = [
  { id: "bank", name: "Bank", yahooSymbol: "^NSEBANK" },
  { id: "psu_bank", name: "PSU Bank", yahooSymbol: "^CNXPSUBANK" },
  { id: "it", name: "IT", yahooSymbol: "^CNXIT" },
  { id: "auto", name: "Auto", yahooSymbol: "^CNXAUTO" },
  { id: "fmcg", name: "FMCG", yahooSymbol: "^CNXFMCG" },
  { id: "pharma", name: "Pharma", yahooSymbol: "^CNXPHARMA" },
  { id: "metal", name: "Metal", yahooSymbol: "^CNXMETAL" },
  { id: "energy", name: "Energy", yahooSymbol: "^CNXENERGY" },
  { id: "realty", name: "Realty", yahooSymbol: "^CNXREALTY" },
  { id: "financial_services", name: "Financial Services", yahooSymbol: "^CNXFIN" },
  { id: "media", name: "Media", yahooSymbol: "^CNXMEDIA" },
  { id: "infra", name: "Infrastructure", yahooSymbol: "^CNXINFRA" },
];

export function getSectorById(id: SectorId): NiftySector | undefined {
  return NIFTY_SECTORS.find((s) => s.id === id);
}
