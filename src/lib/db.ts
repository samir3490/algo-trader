import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  prismaInitFailed: boolean | undefined;
};

/**
 * Lazy Prisma for optional Postgres (candle cache, backtest history).
 * Returns null when DATABASE_URL is unset or client init fails — app uses Yahoo/Firebase only.
 */
export function getPrisma(): PrismaClient | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (globalForPrisma.prismaInitFailed) return null;

  try {
    if (!globalForPrisma.prisma) {
      const pool =
        globalForPrisma.pool ??
        new Pool({
          connectionString: url,
          max: 5,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
        });
      globalForPrisma.pool = pool;
      const adapter = new PrismaPg(pool);
      globalForPrisma.prisma = new PrismaClient({ adapter });
    }
    return globalForPrisma.prisma;
  } catch (e) {
    globalForPrisma.prismaInitFailed = true;
    console.error("Prisma init failed (backtest will use Yahoo only):", e);
    return null;
  }
}
