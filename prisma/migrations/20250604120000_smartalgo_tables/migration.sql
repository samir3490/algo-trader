-- Optional: run when DATABASE_URL is configured
-- npx prisma migrate deploy

CREATE TABLE IF NOT EXISTS "SymbolMaster" (
    "id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "companyName" TEXT,
    "instrumentToken" TEXT,
    "lotSize" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SymbolMaster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SymbolMaster_exchange_symbol_key" ON "SymbolMaster"("exchange", "symbol");

CREATE TABLE IF NOT EXISTS "Candle" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'NSE',
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(12,4) NOT NULL,
    "high" DECIMAL(12,4) NOT NULL,
    "low" DECIMAL(12,4) NOT NULL,
    "close" DECIMAL(12,4) NOT NULL,
    "volume" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'yahoo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Candle_symbol_exchange_timeframe_timestamp_key" ON "Candle"("symbol", "exchange", "timeframe", "timestamp");
CREATE INDEX IF NOT EXISTS "Candle_symbol_timeframe_timestamp_idx" ON "Candle"("symbol", "timeframe", "timestamp");

CREATE TABLE IF NOT EXISTS "BacktestRun" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'NSE',
    "timeframe" TEXT NOT NULL DEFAULT 'Day',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "initialCapital" DECIMAL(14,2) NOT NULL,
    "finalCapital" DECIMAL(14,2) NOT NULL,
    "totalReturnPct" DECIMAL(10,4) NOT NULL,
    "winRate" DECIMAL(10,4) NOT NULL,
    "profitFactor" DECIMAL(10,4) NOT NULL,
    "maxDrawdownPct" DECIMAL(10,4) NOT NULL,
    "sharpeRatio" DECIMAL(10,4) NOT NULL,
    "reportJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

CREATE TABLE IF NOT EXISTS "RiskCheck" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyId" TEXT,
    "approved" BOOLEAN NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskCheck_pkey" PRIMARY KEY ("id")
);
