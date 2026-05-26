import { NextRequest, NextResponse } from "next/server";
import { NSE_INSTRUMENTS, type Instrument } from "@/lib/instruments";

const MAX_RESULTS = 20;

function deduplicateInstruments(instruments: Instrument[]): Instrument[] {
  const seen = new Set<string>();
  return instruments.filter((inst) => {
    const key = `${inst.exchange}:${inst.symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const INSTRUMENTS = deduplicateInstruments(NSE_INSTRUMENTS);

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim().toUpperCase() || "";
  const exchange = request.nextUrl.searchParams.get("exchange")?.toUpperCase() as "NSE" | "BSE" | null;

  let filtered = INSTRUMENTS;

  if (exchange) {
    filtered = filtered.filter((i) => i.exchange === exchange);
  }

  if (!search) {
    return NextResponse.json(filtered.slice(0, MAX_RESULTS));
  }

  const exactSymbol: Instrument[] = [];
  const startsWithSymbol: Instrument[] = [];
  const containsInName: Instrument[] = [];

  for (const inst of filtered) {
    const sym = inst.symbol.toUpperCase();
    const name = inst.name.toUpperCase();

    if (sym === search) {
      exactSymbol.push(inst);
    } else if (sym.startsWith(search)) {
      startsWithSymbol.push(inst);
    } else if (name.includes(search) || sym.includes(search)) {
      containsInName.push(inst);
    }
  }

  const results = [...exactSymbol, ...startsWithSymbol, ...containsInName].slice(0, MAX_RESULTS);

  const mapped = results.map((inst) => ({
    tradingsymbol: inst.symbol,
    name: inst.name,
    exchange: inst.exchange,
    instrument_type: "EQ",
  }));

  return NextResponse.json(mapped);
}
