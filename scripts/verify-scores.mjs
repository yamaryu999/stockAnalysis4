import { calculateScore, loadWeights } from "@kabu4/core";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

const toStartOfUtcDay = (date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

function mapEventTag(event) {
  switch (event.type) {
    case "GUIDE_UP":
      return "GUIDE_UP";
    case "TDNET":
      return "TDNET";
    case "VOL_SPIKE":
      return "VOL_SPIKE";
    case "EARNINGS":
      return "EARNINGS_POSITIVE";
    case "NEWS": {
      if (typeof event.scoreRaw === "number") {
        if (event.scoreRaw >= 0.6) return "NEWS_POS";
        if (event.scoreRaw <= 0.3) return "NEWS_NEG";
        return "NEWS_NEU";
      }
      return "NEWS_NEU";
    }
    default:
      return null;
  }
}

function toEventSignal(event) {
  const tag = mapEventTag(event);
  if (!tag) {
    return null;
  }
  return {
    tag,
    type: event.type,
    title: event.title,
    summary: event.summary ?? undefined,
    source: event.source,
    score: typeof event.scoreRaw === "number" ? Math.max(Math.min(event.scoreRaw, 1), 0) : undefined,
    occurredAt: event.date
  };
}

function computeRecentNegativePenalty(signals, targetDate) {
  const latestDay = toStartOfUtcDay(targetDate);
  let penalty = 0;
  for (const signal of signals) {
    const eventDay = toStartOfUtcDay(signal.occurredAt);
    const diffDays = Math.floor((latestDay.getTime() - eventDay.getTime()) / DAY_MS);
    if (diffDays < 0) continue;
    if (signal.tag === "NEWS_NEG" && diffDays <= 5) {
      penalty = Math.max(penalty, 0.2);
    }
    if (signal.tag === "TDNET" && signal.title.includes("下方") && diffDays <= 5) {
      penalty = Math.max(penalty, 0.3);
    }
  }
  return penalty;
}

async function verifyScores(weights) {
  const latestPick = await prisma.pick.findFirst({
    orderBy: { date: "desc" }
  });
  if (!latestPick) {
    console.log("No picks found. Run ingest before verifying.");
    return;
  }

  const targetStart = toStartOfUtcDay(latestPick.date);
  const targetEnd = addDays(targetStart, 1);
  const lookbackStart = addDays(targetStart, -10);

  const picks = await prisma.pick.findMany({
    where: { date: targetStart },
    orderBy: { scoreFinal: "desc" }
  });
  const codes = picks.map((pick) => pick.code);

  if (codes.length === 0) {
    console.log(`No picks found for ${targetStart.toISOString().slice(0, 10)}.`);
    return;
  }

  const [featureRows, priceRows, eventRows] = await Promise.all([
    prisma.feature.findMany({
      where: {
        code: { in: codes },
        date: { gte: targetStart, lt: targetEnd }
      }
    }),
    prisma.dailyPrice.findMany({
      where: {
        code: { in: codes },
        date: { gte: targetStart, lt: targetEnd }
      }
    }),
    prisma.corporateEvent.findMany({
      where: {
        code: { in: codes },
        date: { gte: lookbackStart, lt: targetEnd }
      }
    })
  ]);

  const featureMap = new Map();
  featureRows.forEach((row) => {
    const bucket = featureMap.get(row.code) ?? {};
    bucket[row.name] = Number(row.value);
    featureMap.set(row.code, bucket);
  });

  const priceMap = new Map();
  priceRows.forEach((row) => {
    priceMap.set(row.code, Number(row.close));
  });

  const eventsByCode = new Map();
  eventRows.forEach((event) => {
    const signal = toEventSignal(event);
    if (!signal) return;
    const list = eventsByCode.get(event.code) ?? [];
    list.push(signal);
    eventsByCode.set(event.code, list);
  });

  const mismatches = [];

  for (const pick of picks) {
    const tape = featureMap.get(pick.code) ?? {};
    const price = priceMap.get(pick.code);
    const signals = eventsByCode.get(pick.code) ?? [];
    const penalty = computeRecentNegativePenalty(signals, targetStart);

    const score = calculateScore({
      weights,
      tape: {
        volumeZ: tape["volume_z"],
        gapPct: tape["gap_pct"],
        supplyDemandProxy: tape["supply_demand_proxy"],
        high20dDistPct: tape["high20d_dist_pct"],
        close: price
      },
      events: signals,
      penalties: { recentNegative: penalty }
    });

    const difference = Math.abs(score.normalized - Number(pick.scoreFinal));
    if (difference > 0.01) {
      mismatches.push({
        code: pick.code,
        expected: Number(pick.scoreFinal),
        actual: Math.round(score.normalized * 100) / 100
      });
    }
  }

  if (mismatches.length > 0) {
    console.error(`Detected ${mismatches.length} mismatched scores:`);
    mismatches.forEach((item) => {
      console.error(` - ${item.code}: stored=${item.expected}, recalculated=${item.actual}`);
    });
    process.exit(1);
  }

  console.log(`Validated ${picks.length} picks for ${targetStart.toISOString().slice(0, 10)}. All scores match.`);
}

async function main() {
  try {
    const weights = loadWeights();
    await verifyScores(weights);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
