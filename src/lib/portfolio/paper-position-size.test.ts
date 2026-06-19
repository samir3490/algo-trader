import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePaperOrderCap,
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

  it("caps atr sizing to max per trade", () => {
    const atrSettings = {
      ...settings,
      positionSizingMode: "atr_risk" as const,
      atrRiskPct: 50,
      paperMaxOrderValue: 500_000,
    };
    assert.equal(
      resolvePaperOrderQty(100, atrSettings, { balance: 4_000_000, atr: 1 }),
      5000
    );
  });

  it("applies cap before atr risk budget", () => {
    const atrSettings = {
      ...settings,
      positionSizingMode: "atr_risk" as const,
      atrRiskPct: 10,
      paperMaxOrderValue: 100_000,
    };
    // ceiling 100k, risk 10% of 4M = 400k → risk budget 100k, qty = 100k/atr 50 = 2000
    // position 2000 × ₹50 = ₹100k (at ceiling)
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
    // 10% of 4M = 400k but ceiling 100k → budget 100k → 1000 shares @ ₹100
    assert.equal(
      resolvePaperOrderQty(100, pctSettings, { balance: 4_000_000 }),
      1000
    );
  });

  it("skips buy when turnover below min per trade", () => {
    assert.equal(
      resolvePaperOrderQty(10_000, settings, {
        balance: 20_000,
        strategyParams: { quantity: 1 },
      }),
      0
    );
  });

  it("bumps qty up to meet min per trade when affordable", () => {
    // min ₹25k @ ₹1000/share → 25 shares = ₹25k
    assert.equal(
      resolvePaperOrderQty(1000, { ...settings, paperMinOrderValue: 25_000 }, {
        strategyParams: { quantity: 5 },
      }),
      25
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
