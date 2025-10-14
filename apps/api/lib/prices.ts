import { prisma } from "./prisma";

export async function fetchSymbolPrices(code: string, window = 30) {
  const rows = await prisma.dailyPrice.findMany({
    where: {
      code
    },
    orderBy: {
      date: "desc"
    },
    take: window
  });

  return rows
    .map((row) => ({
      date: row.date.toISOString(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume
    }))
    .reverse();
}
