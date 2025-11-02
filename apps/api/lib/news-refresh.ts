import fs from "node:fs/promises";
import path from "node:path";
import { CorporateEvent, DailyPrice, Feature } from "@prisma/client";
import { EventSignal, EventTag, EventType, calculateScore } from "@kabu4/core";
import * as cheerio from "cheerio";
import { prisma } from "./prisma";
import { getWeights } from "./weights";

const DAY_MS = 24 * 60 * 60 * 1000;

type NewsPolarity = "pos" | "neg" | "neu";

type NewsItem = {
  code: string;
  title: string;
  summary: string;
  publishedAt: Date;
  polarity: NewsPolarity;
};

type SignalWithContext = {
  signal: EventSignal;
  title: string;
};

type RebuildResult = {
  date: string;
  picksCount: number;
};

const POLARITY_MAP: Record<
  NewsPolarity,
  {
    tag: "NEWS_POS" | "NEWS_NEG" | "NEWS_NEU";
    score: number;
  }
> = {
  pos: { tag: "NEWS_POS", score: 0.7 },
  neg: { tag: "NEWS_NEG", score: 0.3 },
  neu: { tag: "NEWS_NEU", score: 0.4 }
};

function inferPolarity(text: string): NewsPolarity {
  const positives = ["上方", "増益", "増配", "最高益", "上振れ", "黒字"];
  const negatives = ["下方", "減益", "減配", "赤字", "下振れ"];
  if (positives.some((keyword) => text.includes(keyword))) {
    return "pos";
  }
  if (negatives.some((keyword) => text.includes(keyword))) {
    return "neg";
  }
  return "neu";
}

function toStartOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function toDateKey(date: Date): string {
  return toStartOfUtcDay(date).toISOString().slice(0, 10);
}

async function resolveSampleNewsPath(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), "data/sample/news.json"),
    path.resolve(process.cwd(), "../data/sample/news.json"),
    path.resolve(process.cwd(), "../../data/sample/news.json")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function parseJsonNews(raw: string): NewsItem[] {
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((entry) => {
        const code = String(entry.code ?? "").trim();
        const title = String(entry.title ?? "").trim();
        if (!code || !title) {
          return null;
        }
        const summary = String(entry.summary ?? "").trim();
        const polarity = (entry.polarity as NewsPolarity | undefined) ?? inferPolarity(title);
        const publishedAt = entry.date ? new Date(entry.date) : new Date();
        if (Number.isNaN(publishedAt.getTime())) {
          return null;
        }
        return {
          code,
          title,
          summary,
          polarity,
          publishedAt
        } satisfies NewsItem;
      })
      .filter((item): item is NewsItem => Boolean(item));
  } catch {
    return [];
  }
}

function parseHtmlNews(html: string): NewsItem[] {
  const $ = cheerio.load(html);
  const items: NewsItem[] = [];
  $("table.s_news_list tr").each((_, row) => {
    const codeCell = $(row).find("td.oncodetip_code-data1");
    const link = $(row).find("a").first();
    if (!codeCell.length || !link.length) {
      return;
    }
    const code = (codeCell.attr("data-code") || codeCell.text()).trim();
    if (!code) {
      return;
    }
    const title = link.text().trim();
    if (!title) {
      return;
    }
    const summary = "";
    const timeTag = $(row).find("time").first();
    let publishedAt = new Date();
    if (timeTag.length) {
      const raw = timeTag.attr("datetime") || "";
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        publishedAt = parsed;
      }
    }
    items.push({
      code,
      title,
      summary,
      polarity: inferPolarity(title),
      publishedAt
    });
  });
  return items;
}

async function fetchLiveNews(feedUrl: string): Promise<NewsItem[]> {
  const response = await fetch(feedUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": process.env.HTTP_USER_AGENT ?? "kabu4-api/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch news (${response.status})`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  if (contentType.includes("application/json")) {
    const items = parseJsonNews(raw);
    if (items.length > 0) {
      return items;
    }
  }
  const parsedJson = parseJsonNews(raw);
  if (parsedJson.length > 0) {
    return parsedJson;
  }
  return parseHtmlNews(raw);
}

async function loadFallbackNews(): Promise<NewsItem[]> {
  const samplePath = await resolveSampleNewsPath();
  if (!samplePath) {
    return [];
  }
  try {
    const raw = await fs.readFile(samplePath, "utf-8");
    return parseJsonNews(raw);
  } catch {
    return [];
  }
}

function mapEventTag(event: CorporateEvent): EventTag | null {
  switch (event.type as EventType) {
    case "GUIDE_UP":
      return "GUIDE_UP";
    case "TDNET":
      return "TDNET";
    case "VOL_SPIKE":
      return "VOL_SPIKE";
    case "EARNINGS":
      return "EARNINGS_POSITIVE";
    case "NEWS": {
      const score = typeof event.scoreRaw === "number" ? event.scoreRaw : 0.4;
      if (score >= 0.6) {
        return "NEWS_POS";
      }
      if (score <= 0.3) {
        return "NEWS_NEG";
      }
      return "NEWS_NEU";
    }
    default:
      return null;
  }
}

function toSignalWithContext(event: CorporateEvent): SignalWithContext | null {
  const tag = mapEventTag(event);
  if (!tag) {
    return null;
  }
  const signal: EventSignal = {
    tag,
    type: event.type as EventType,
    title: event.title,
    summary: event.summary ?? undefined,
    source: event.source,
    score: typeof event.scoreRaw === "number" ? Math.max(Math.min(event.scoreRaw, 1), 0) : undefined,
    occurredAt: event.date
  };
  return { signal, title: event.title };
}

function computeRecentNegativePenalty(events: SignalWithContext[], targetDate: Date): number {
  const latestDay = toStartOfUtcDay(targetDate);
  let penalty = 0;
  for (const { signal, title } of events) {
    const eventDay = toStartOfUtcDay(signal.occurredAt);
    const diffDays = Math.floor((latestDay.getTime() - eventDay.getTime()) / DAY_MS);
    if (signal.tag === "NEWS_NEG" && diffDays <= 5 && diffDays >= 0) {
      penalty = Math.max(penalty, 0.2);
    }
    if (signal.tag === "TDNET" && title.includes("下方") && diffDays <= 5 && diffDays >= 0) {
      penalty = Math.max(penalty, 0.3);
    }
  }
  return penalty;
}

function buildFeatureMap(rows: Feature[]): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  rows.forEach((row) => {
    const bucket = map.get(row.code) ?? {};
    bucket[row.name] = row.value;
    map.set(row.code, bucket);
  });
  return map;
}

function buildPriceMap(rows: DailyPrice[]): Map<string, DailyPrice> {
  const map = new Map<string, DailyPrice>();
  rows.forEach((row) => {
    map.set(row.code, row);
  });
  return map;
}

async function rebuildPicks(): Promise<RebuildResult> {
  const weights = getWeights();
  const [latestPrice, latestEvent] = await Promise.all([
    prisma.dailyPrice.findFirst({
      orderBy: { date: "desc" }
    }),
    prisma.corporateEvent.findFirst({
      orderBy: { date: "desc" }
    })
  ]);
  const candidates = [latestPrice?.date, latestEvent?.date].filter(
    (value): value is Date => value instanceof Date
  );
  if (candidates.length === 0) {
    return { date: toDateKey(new Date()), picksCount: 0 };
  }
  const latest = candidates.reduce((acc, next) => (next > acc ? next : acc));
  const targetStart = toStartOfUtcDay(latest);
  const targetEnd = addDays(targetStart, 1);
  const lookbackStart = addDays(targetStart, -10);

  const [priceRows, featureRows, eventRows] = await Promise.all([
    prisma.dailyPrice.findMany({
      where: {
        date: {
          gte: targetStart,
          lt: targetEnd
        }
      }
    }),
    prisma.feature.findMany({
      where: {
        date: {
          gte: targetStart,
          lt: targetEnd
        }
      }
    }),
    prisma.corporateEvent.findMany({
      where: {
        date: {
          gte: lookbackStart,
          lt: targetEnd
        }
      },
      orderBy: {
        date: "desc"
      }
    })
  ]);

  const featureMap = buildFeatureMap(featureRows);
  const priceMap = buildPriceMap(priceRows);
  const eventsByCode = new Map<string, CorporateEvent[]>();
  eventRows.forEach((event) => {
    const list = eventsByCode.get(event.code) ?? [];
    list.push(event);
    eventsByCode.set(event.code, list);
  });

  const codes = new Set<string>();
  priceRows.forEach((row) => codes.add(row.code));
  featureRows.forEach((row) => codes.add(row.code));
  eventRows.forEach((event) => codes.add(event.code));

  const picks: Array<{
    code: string;
    score: ReturnType<typeof calculateScore>;
    stats: Record<string, number | null>;
  }> = [];

  for (const code of codes) {
    const events = (eventsByCode.get(code) ?? []).filter(
      (event) => event.date >= lookbackStart && event.date < targetEnd
    );
    const signals = events
      .map((event) => toSignalWithContext(event))
      .filter((item): item is SignalWithContext => Boolean(item));

    if (signals.length === 0 && !featureMap.has(code)) {
      continue;
    }

    const featureBucket = featureMap.get(code) ?? {};
    const price = priceMap.get(code);
    const penalty = computeRecentNegativePenalty(signals, targetStart);
    const tape = {
      volumeZ: featureBucket["volume_z"],
      gapPct: featureBucket["gap_pct"],
      supplyDemandProxy: featureBucket["supply_demand_proxy"],
      high20dDistPct: featureBucket["high20d_dist_pct"],
      close: price ? Number(price.close) : undefined
    };

    const score = calculateScore({
      tape,
      events: signals.map((item) => item.signal),
      weights,
      penalties: { recentNegative: penalty }
    });

    if (score.normalized >= weights.minScore) {
      picks.push({
        code,
        score,
        stats: {
          volume_z: Number.isFinite(tape.volumeZ) ? (tape.volumeZ as number) : null,
          gap_pct: Number.isFinite(tape.gapPct) ? (tape.gapPct as number) : null,
          supply_demand_proxy: Number.isFinite(tape.supplyDemandProxy)
            ? (tape.supplyDemandProxy as number)
            : null
        }
      });
    }
  }

  await prisma.$transaction([
    prisma.pick.deleteMany(),
    ...picks.map((pick) =>
      prisma.pick.create({
        data: {
          date: targetStart,
          code: pick.code,
          scoreFinal: Math.round(pick.score.normalized * 100) / 100,
          reasons: JSON.stringify(pick.score.reasons),
          stats: JSON.stringify(pick.stats)
        }
      })
    )
  ]);

  return {
    date: toDateKey(targetStart),
    picksCount: picks.length
  };
}

async function upsertNews(items: NewsItem[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }
  await prisma.$transaction(
    items.map((item) => {
      const config = POLARITY_MAP[item.polarity];
      const dateKey = toDateKey(item.publishedAt);
      const id = `${item.code}-${dateKey}-${config.tag}-news`;
      return prisma.corporateEvent.upsert({
        where: { id },
        create: {
          id,
          code: item.code,
          date: item.publishedAt,
          type: "NEWS",
          title: item.title,
          summary: item.summary,
          source: "news",
          scoreRaw: config.score
        },
        update: {
          title: item.title,
          summary: item.summary,
          date: item.publishedAt,
          scoreRaw: config.score
        }
      });
    })
  );
  return items.length;
}

export async function refreshNewsAndPicks(): Promise<{
  newsCount: number;
  eventsUpserted: number;
  picksCount: number;
  date: string;
}> {
  const feedUrl = process.env.NEWS_FEED_URL;
  let newsItems: NewsItem[] = [];
  if (feedUrl) {
    try {
      newsItems = await fetchLiveNews(feedUrl);
    } catch (error) {
      console.warn("Failed to fetch live news feed:", error);
    }
  }
  if (newsItems.length === 0) {
    newsItems = await loadFallbackNews();
  }
  if (newsItems.length === 0) {
    throw new Error("ニュース情報を取得できませんでした。");
  }

  const eventsUpserted = await upsertNews(newsItems);
  const { date, picksCount } = await rebuildPicks();

  return {
    newsCount: newsItems.length,
    eventsUpserted,
    picksCount,
    date
  };
}
