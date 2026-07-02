import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePaperOrderCap,
  formatPaperBuySizingNote,
  formatPaperSizingSummary,
  integerShareQtyForBudget,
  paperOrderNotional,
  resolvePaperOrderQty,
  resolvePaperScanOrderQty,
} from "./paper-position-size";

const settings = {
  paperOrderNotional: 100_000,
  paperMaxOrderValue: 500_000,
  paperMinOrderValue: 25_000,
  defaultQuantity: 1,
  positionSizingMode: "notional" as const,
  positionPct: 10,
  atrRiskPct: 1,
  atrPeriod: 14,
  atrStopMultiplier: 2,
  simulateBrokerage: false,
  paperDefaultProduct: "CNC" as const,
};

describe("integerShareQtyForBudget", () => {
  it("returns whole shares up to budget", () => {
    assert.equal(integerShareQtyForBudget(3333, 100_000), 30);
  });

  it("returns 0 when one share exceeds budget", () => {
    assert.equal(integerShareQtyForBudget(150_000, 100_000), 0);
  });

  it("respects available balance", () => {
    assert.equal(integerShareQtyForBudget(100, 100_000, 5000), 50);
  });
});

describe("resolvePaperOrderQty", () => {
  it("buys ~1L notional for a ₹10 stock", () => {
    assert.equal(resolvePaperOrderQty(10, settings), 10_000);
  });

  it("buys ~1L notional for a ₹1000 stock", () => {
    assert.equal(resolvePaperOrderQty(1000, settings), 100);
  });

  it("respects available balance", () => {
    assert.equal(
      resolvePaperOrderQty(100, { ...settings, paperMinOrderValue: 0 }, {
        balance: 5000,
      }),
      50
    );
  });

  it("returns 0 when share price exceeds budget", () => {
    assert.equal(resolvePaperOrderQty(150_000, settings), 0);
  });

  it("uses explicit strategy quantity when set", () => {
    assert.equal(
      resolvePaperOrderQty(1000, { ...settings, paperMinOrderValue: 0 }, {
        strategyParams: { quantity: 5 },
      }),
      5
    );
  });

  it("caps explicit quantity to max per trade", () => {
    assert.equal(
      resolvePaperOrderQty(1000, { ...settings, paperMaxOrderValue: 500_000 }, {
        strategyParams: { quantity: 1000 },
      }),
      500
    );
  });

  it("caps portfolio pct sizing to max per trade", () => {
    const pctSettings = {
      ...settings,
      positionSizingMode: "portfolio_pct" as const,
      positionPct: 50,
      paperMaxOrderValue: 500_000,
    };
    assert.equal(
      resolvePaperOrderQty(100, pctSettings, { balance: 4_000_000 }),
      5000
    );
  });

  it("atr sizing scales down when volatility is high", () => {
    const atrSettings = {
      ...settings,
      positionSizingMode: "atr_risk" as const,
      atrRiskPct: 1,
      atrStopMultiplier: 2,
      paperMaxOrderValue: 500_000,
    };
    const lowVol = resolvePaperOrderQty(1000, atrSettings, {
      balance: 1_000_000,
      atr: 15,
    });
    const highVol = resolvePaperOrderQty(1000, atrSettings, {
      balance: 1_000_000,
      atr: 60,
    });
    assert.ok(lowVol > highVol);
    assert.equal(lowVol * 1000, 333_000);
    assert.equal(highVol * 1000, 83_000);
  });

  it("atr sizing caps at max per trade", () => {
    const atrSettings = {
      ...settings,
      positionSizingMode: "atr_risk" as const,
      atrRiskPct: 50,
      atrStopMultiplier: 2,
      paperMaxOrderValue: 500_000,
    };
    assert.equal(
      resolvePaperOrderQty(100, atrSettings, { balance: 4_000_000, atr: 1 }),
      5000
    );
  });

  it("atr sizing respects ceiling with wide stop", () => {
    const atrSettings = {
      ...settings,
      positionSizingMode: "atr_risk" as const,
      atrRiskPct: 10,
      atrStopMultiplier: 2,
      paperMaxOrderValue: 100_000,
    };
    assert.equal(
      resolvePaperOrderQty(50, atrSettings, { balance: 4_000_000, atr: 50 }),
      2000
    );
  });

  it("portfolio pct uses ceiling before pct of balance", () => {
    const pctSettings = {
      ...settings,
      positionSizingMode: "portfolio_pct" as const,
      positionPct: 10,
      paperMaxOrderValue: 100_000,
    };
    assert.equal(
      resolvePaperOrderQty(100, pctSettings, { balance: 4_000_000 }),
      1000
    );
  });

  it("skips explicit qty below min without bumping", () => {
    assert.equal(
      resolvePaperOrderQty(1000, settings, {
        strategyParams: { quantity: 5 },
      }),
      0
    );
  });

  it("skips when mode budget is below min per trade", () => {
    assert.equal(
      resolvePaperOrderQty(100, {
        ...settings,
        paperOrderNotional: 15_000,
        paperMinOrderValue: 25_000,
      }),
      0
    );
  });

  it("skips atr sizing when turnover is below min", () => {
    assert.equal(
      resolvePaperOrderQty(100, {
        ...settings,
        positionSizingMode: "atr_risk" as const,
        atrRiskPct: 0.5,
        atrStopMultiplier: 2,
        paperMinOrderValue: 25_000,
      }, { balance: 100_000, atr: 10 }),
      0
    );
  });

  it("skips atr sizing when ATR is missing", () => {
    assert.equal(
      resolvePaperOrderQty(100, {
        ...settings,
        positionSizingMode: "atr_risk" as const,
      }, { balance: 1_000_000 }),
      0
    );
  });

  it("skips when min per trade exceeds ceiling", () => {
    assert.equal(
      resolvePaperOrderQty(1000, {
        ...settings,
        paperMaxOrderValue: 20_000,
        paperMinOrderValue: 25_000,
      }),
      0
    );
  });
});

describe("resolvePaperScanOrderQty", () => {
  it("ignores default quantity=1 and uses notional", () => {
    assert.equal(
      resolvePaperScanOrderQty(100, settings, { strategyParams: { quantity: 1 } }),
      1000
    );
  });

  it("respects explicit quantity when > 1", () => {
    assert.equal(
      resolvePaperScanOrderQty(100, { ...settings, paperMinOrderValue: 0 }, {
        strategyParams: { quantity: 50 },
      }),
      50
    );
  });

  it("uses portfolio pct when mode is portfolio_pct", () => {
    const pctSettings = { ...settings, positionSizingMode: "portfolio_pct" as const, positionPct: 10 };
    assert.equal(resolvePaperOrderQty(100, pctSettings, { balance: 1_000_000 }), 1000);
  });
});

describe("paperOrderNotional", () => {
  it("defaults to 1 lakh", () => {
    assert.equal(
      paperOrderNotional({ paperOrderNotional: 100_000 }),
      100_000
    );
  });
});

describe("effectivePaperOrderCap", () => {
  it("uses paper max per trade setting", () => {
    assert.equal(
      effectivePaperOrderCap({ paperMaxOrderValue: 500_000 }),
      500_000
    );
  });

  it("defaults to 5 lakh when unset", () => {
    assert.equal(effectivePaperOrderCap({}), 500_000);
  });
});

describe("formatPaperSizingSummary", () => {
  it("describes ATR risk mode", () => {
    const text = formatPaperSizingSummary({
      ...settings,
      positionSizingMode: "atr_risk",
      atrRiskPct: 1,
      atrStopMultiplier: 2,
    });
    assert.match(text, /ATR risk/);
    assert.match(text, /1%/);
    assert.match(text, /2× ATR/);
  });

  it("describes portfolio pct mode", () => {
    const text = formatPaperSizingSummary({
      ...settings,
      positionSizingMode: "portfolio_pct",
      positionPct: 10,
    });
    assert.match(text, /10% of balance/);
  });

  it("describes fixed notional mode", () => {
    const text = formatPaperSizingSummary({
      ...settings,
      positionSizingMode: "notional",
      paperOrderNotional: 100_000,
    });
    assert.match(text, /Fixed ₹1L/);
  });
});

describe("formatPaperBuySizingNote", () => {
  it("includes ATR and turnover for executed buy", () => {
    const note = formatPaperBuySizingNote(
      {
        ...settings,
        positionSizingMode: "atr_risk",
        atrRiskPct: 1,
        atrStopMultiplier: 2,
      },
      { qty: 100, price: 1000, balance: 1_000_000, atr: 15 }
    );
    assert.match(note, /ATR 1%/);
    assert.match(note, /ATR ₹15\.0/);
    assert.match(note, /turnover ₹1L/);
  });

  it("flags max cap when turnover nears ceiling", () => {
    const note = formatPaperBuySizingNote(
      {
        ...settings,
        positionSizingMode: "portfolio_pct",
        positionPct: 50,
      },
      { qty: 5000, price: 100, balance: 4_000_000 }
    );
    assert.match(note, /@ max cap/);
  });
});
