import { getSectorForSymbol } from "@/lib/universe/sector-map";
import { getSectorById, type SectorId } from "@/lib/universe/sectors";
import type { SectorPerformanceRow } from "@/lib/market-data/sector-performance";

export interface SectorBiasEntry {
  sectorId: SectorId;
  sectorName: string;
  changePercent: number;
  /** 1 = best performing sector today. */
  rank: number;
  totalSectors: number;
  /** Top 3 or positive & above median. */
  isStrong: boolean;
}

export interface SectorBiasContext {
  bySectorId: Map<SectorId, SectorBiasEntry>;
  topSectors: SectorBiasEntry[];
  summaryLine: string;
  fetchedAt: string;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Build bias context from sorted sector performance rows (best first). */
export function buildSectorBiasContext(
  sectors: Pick<SectorPerformanceRow, "id" | "name" | "changePercent">[],
  fetchedAt = new Date().toISOString()
): SectorBiasContext {
  const total = sectors.length;
  const medianRank = Math.max(1, Math.ceil(total / 2));
  const bySectorId = new Map<SectorId, SectorBiasEntry>();

  sectors.forEach((s, i) => {
    const rank = i + 1;
    const isStrong =
      rank <= 3 || (s.changePercent > 0 && rank <= medianRank);
    bySectorId.set(s.id, {
      sectorId: s.id,
      sectorName: s.name,
      changePercent: s.changePercent,
      rank,
      totalSectors: total,
      isStrong,
    });
  });

  const topSectors = [...bySectorId.values()]
    .filter((e) => e.isStrong)
    .sort((a, b) => a.rank - b.rank);

  const summaryLine =
    topSectors.length > 0
      ? `Leading sectors: ${topSectors
          .slice(0, 3)
          .map((e) => `${e.sectorName} ${formatPct(e.changePercent)}`)
          .join(", ")}`
      : "No strong sectors today — ranking by relative sector performance";

  return { bySectorId, topSectors, summaryLine, fetchedAt };
}

export function lookupSectorBias(
  symbol: string,
  ctx: SectorBiasContext | null | undefined
): SectorBiasEntry | null {
  if (!ctx) return null;
  const sectorId = getSectorForSymbol(symbol);
  if (!sectorId) return null;
  return ctx.bySectorId.get(sectorId) ?? null;
}

/** One-line sector performance for emails / audit. */
export function formatSectorPerformanceLine(
  entry: SectorBiasEntry | null | undefined,
  symbol?: string
): string {
  if (!entry) {
    if (symbol) {
      const id = getSectorForSymbol(symbol);
      const name = id ? getSectorById(id)?.name ?? id : null;
      return name
        ? `${name} sector (no live index quote)`
        : "Sector unmapped";
    }
    return "Sector unmapped";
  }
  const strength = entry.isStrong ? "strong today" : "lagging today";
  return `${entry.sectorName} ${formatPct(entry.changePercent)} (#${entry.rank} of ${entry.totalSectors} · ${strength})`;
}

/** Prefer the more detailed trade reason (sector / length). */
export function pickRicherReason(
  a?: string | null,
  b?: string | null
): string | undefined {
  const left = a?.trim() || "";
  const right = b?.trim() || "";
  if (!left) return right || undefined;
  if (!right) return left || undefined;
  const score = (s: string) =>
    (/Preferred sector|Sector context/i.test(s) ? 200 : 0) +
    (/sector/i.test(s) ? 50 : 0) +
    (/RISK EXIT|PROFIT EXIT|Strong ·|turnover/i.test(s) ? 20 : 0) +
    s.length;
  return score(right) > score(left) ? right : left;
}

/** Detailed buy/sell reason appendix with sector context. */
export function formatTradeReasonWithSector(options: {
  baseReason: string;
  side: "BUY" | "SELL";
  entry: SectorBiasEntry | null | undefined;
  symbol?: string;
  extra?: string[];
}): string {
  const parts = [options.baseReason.trim()].filter(Boolean);
  const sectorLine = formatSectorPerformanceLine(options.entry, options.symbol);
  if (options.side === "BUY") {
    parts.push(
      options.entry?.isStrong
        ? `Preferred sector — ${sectorLine}`
        : `Sector context — ${sectorLine}`
    );
  } else {
    parts.push(`Sector context — ${sectorLine}`);
  }
  for (const e of options.extra ?? []) {
    if (e?.trim()) parts.push(e.trim());
  }
  return parts.join(" · ");
}

export function sectorChangeForSort(
  entry: SectorBiasEntry | null | undefined
): number {
  return entry?.changePercent ?? Number.NEGATIVE_INFINITY;
}

export function sectorStrongFirst(
  a: SectorBiasEntry | null | undefined,
  b: SectorBiasEntry | null | undefined
): number {
  const as = a?.isStrong ? 1 : 0;
  const bs = b?.isStrong ? 1 : 0;
  return bs - as;
}
