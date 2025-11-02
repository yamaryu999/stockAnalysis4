import { EventType } from "@kabu4/core";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getWeights } from "./weights";

type PicksQuery = {
  date: string;
  minScore?: number;
  type?: EventType;
};

type PickResponseItem = {
  code: string;
  name: string;
  score: number;
  reasons: unknown;
  stats: {
    volume_z?: number | null;
    gap_pct?: number | null;
    supply_demand_proxy?: number | null;
  };
  lastClose?: number | null;
  high20dDistPct?: number | null;
  events: Array<{
    id: string;
    date: string;
    type: EventType;
    title: string;
    summary: string | null;
    source: string;
    scoreRaw: number | null;
  }>;
};

export type PicksResponse = {
  date: string;
  requestedDate: string;
  fallbackApplied: boolean;
  items: PickResponseItem[];
  weights: ReturnType<typeof getWeights>;
};

function parseJsonField<T>(value: Prisma.JsonValue | string | null): T | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn("Failed to parse JSON field", error);
      return null;
    }
  }
  return value as T;
}

export async function fetchPicks(params: PicksQuery): Promise<PicksResponse> {
  const weights = getWeights();
  const minScore = params.minScore ?? weights.minScore;

  const toWindow = (isoDate: string) => {
    const start = new Date(`${isoDate}T00:00:00.000Z`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  };

  const requestedDate = params.date;
  let effectiveDate = requestedDate;
  let { start: targetDate, end: nextDate } = toWindow(effectiveDate);

  let picks = await prisma.pick.findMany({
    where: {
      date: { gte: targetDate, lt: nextDate },
      scoreFinal: { gte: minScore }
    },
    include: { symbol: true },
    orderBy: { scoreFinal: "desc" }
  });

  // Fallback: if no picks for the requested date, use the latest available date with picks
  if (picks.length === 0) {
    const latest = await prisma.pick.findFirst({
      where: { scoreFinal: { gte: minScore } },
      orderBy: { date: "desc" }
    });
    if (latest) {
      const latestIso = latest.date.toISOString().slice(0, 10);
      if (latestIso !== effectiveDate) {
        effectiveDate = latestIso;
        ({ start: targetDate, end: nextDate } = toWindow(effectiveDate));
        picks = await prisma.pick.findMany({
          where: {
            date: { gte: targetDate, lt: nextDate },
            scoreFinal: { gte: minScore }
          },
          include: { symbol: true },
          orderBy: { scoreFinal: "desc" }
        });
      }
    }
  }

  const codes = picks.map((pick) => pick.code);
  if (codes.length === 0) {
    return {
      date: effectiveDate,
      requestedDate,
      fallbackApplied: effectiveDate !== requestedDate,
      items: [],
      weights
    };
  }

  const events = await prisma.corporateEvent.findMany({
    where: {
      code: {
        in: codes
      },
      date: {
        gte: targetDate,
        lt: nextDate
      }
    },
    orderBy: {
      date: "desc"
    }
  });

  const featureRows = await prisma.feature.findMany({
    where: {
      code: {
        in: codes
      },
      date: {
        gte: targetDate,
        lt: nextDate
      },
      name: {
        in: ["volume_z", "gap_pct", "supply_demand_proxy", "high20d_dist_pct"]
      }
    }
  });

  const priceRows = await prisma.dailyPrice.findMany({
    where: {
      code: {
        in: codes
      },
      date: {
        gte: targetDate,
        lt: nextDate
      }
    }
  });

  const featureMap = new Map<string, Record<string, number>>();
  for (const row of featureRows) {
    const key = `${row.code}:${effectiveDate}`;
    const bucket = featureMap.get(key) ?? {};
    bucket[row.name] = row.value;
    featureMap.set(key, bucket);
  }

  const priceMap = new Map<string, number>();
  priceRows.forEach((row) => {
    priceMap.set(`${row.code}:${effectiveDate}`, Number(row.close));
  });

  const eventsByCode = new Map<string, typeof events>();
  events.forEach((event) => {
    const list = eventsByCode.get(event.code) ?? [];
    list.push(event);
    eventsByCode.set(event.code, list);
  });

  const filteredItems = picks
    .map<PickResponseItem>((pick) => {
      const reasons = parseJsonField<unknown[]>(pick.reasons);
      const stats = parseJsonField<Record<string, number | null>>(pick.stats) ?? {};
      const key = `${pick.code}:${effectiveDate}`;
      const featureBucket = featureMap.get(key) ?? {};
      const eventBucket = eventsByCode.get(pick.code) ?? [];

      return {
        code: pick.code,
        name: pick.symbol?.name ?? pick.code,
        score: Number(pick.scoreFinal),
        reasons: reasons ?? [],
        stats: {
          volume_z: stats["volume_z"] ?? featureBucket["volume_z"],
          gap_pct: stats["gap_pct"] ?? featureBucket["gap_pct"],
          supply_demand_proxy: stats["supply_demand_proxy"] ?? featureBucket["supply_demand_proxy"]
        },
        lastClose: priceMap.get(key),
        high20dDistPct: featureBucket["high20d_dist_pct"],
        events: eventBucket.map((event) => ({
          id: event.id,
          date: event.date.toISOString(),
          type: event.type as EventType,
          title: event.title,
          summary: event.summary,
          source: event.source,
          scoreRaw: event.scoreRaw ?? null
        }))
      };
    })
    .filter((item) => {
      if (!params.type) {
        return true;
      }
      return item.events.some((event) => event.type === params.type);
    });

  return {
    date: effectiveDate,
    requestedDate,
    fallbackApplied: effectiveDate !== requestedDate,
    items: filteredItems,
    weights
  };
}
