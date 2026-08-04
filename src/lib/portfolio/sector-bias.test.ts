import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSectorBiasContext,
  formatSectorPerformanceLine,
  formatTradeReasonWithSector,
  lookupSectorBias,
  pickRicherReason,
} from "./sector-bias";

describe("sector-bias", () => {
  const ctx = buildSectorBiasContext([
    { id: "it", name: "IT", changePercent: 1.8 },
    { id: "bank", name: "Bank", changePercent: 0.9 },
    { id: "auto", name: "Auto", changePercent: 0.2 },
    { id: "metal", name: "Metal", changePercent: -0.5 },
    { id: "energy", name: "Energy", changePercent: -1.2 },
  ]);

  it("marks top sectors as strong", () => {
    assert.equal(ctx.bySectorId.get("it")?.isStrong, true);
    assert.equal(ctx.bySectorId.get("bank")?.isStrong, true);
    assert.equal(ctx.bySectorId.get("it")?.rank, 1);
    assert.equal(ctx.bySectorId.get("energy")?.isStrong, false);
    assert.match(ctx.summaryLine, /IT/);
  });

  it("looks up symbol sector bias", () => {
    const tcs = lookupSectorBias("TCS", ctx);
    assert.equal(tcs?.sectorId, "it");
    assert.equal(tcs?.isStrong, true);
    assert.match(formatSectorPerformanceLine(tcs), /IT \+1\.80%/);
  });

  it("formats buy reason with preferred sector", () => {
    const reason = formatTradeReasonWithSector({
      baseReason: "SMA crossover",
      side: "BUY",
      entry: lookupSectorBias("INFY", ctx),
      symbol: "INFY",
      extra: ["Strong · 3 strategies"],
    });
    assert.match(reason, /SMA crossover/);
    assert.match(reason, /Preferred sector/);
    assert.match(reason, /IT/);
    assert.match(reason, /Strong · 3 strategies/);
  });

  it("pickRicherReason prefers sector detail", () => {
    const short = "SMA crossover";
    const detailed = formatTradeReasonWithSector({
      baseReason: "SMA crossover",
      side: "BUY",
      entry: lookupSectorBias("TCS", ctx),
      symbol: "TCS",
    });
    assert.equal(pickRicherReason(short, detailed), detailed);
    assert.equal(pickRicherReason(detailed, short), detailed);
  });
});
