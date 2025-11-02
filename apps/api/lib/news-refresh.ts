import fs from "node:fs/promises";
import path from "node:path";
import { CorporateEvent, DailyPrice, Feature } from "@prisma/client";
import { EventSignal, EventTag, EventType, calculateScore } from "@kabu4/core";
import { parse } from "node-html-parser";
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
  url?: string;
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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MARKET_NEWS_URL = "https://kabutan.jp/news/marketnews/";
const MINKABU_NEWS_URL = "https://minkabu.jp/news";

function toAbsoluteUrl(raw: unknown, baseUrl?: string): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return baseUrl ? new URL(trimmed, baseUrl).toString() : new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

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

function toJstDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  const jstStart = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
  return jstStart.toISOString().slice(0, 10);
}

function filterNewsToLatestDay(items: NewsItem[]): NewsItem[] {
  if (items.length === 0) {
    return items;
  }
  const todayKey = toJstDateKey(new Date());
  const todaysItems = items.filter(
    (item) => toJstDateKey(item.publishedAt) === todayKey
  );
  if (todaysItems.length > 0) {
    return todaysItems;
  }
  return [];
}

async function fetchMarketNewsForToday(maxArticles = 25): Promise<NewsItem[]> {
  try {
    const res = await fetch(MARKET_NEWS_URL, {
      cache: "no-store",
      headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "kabu4-api/1.0" }
    });
    if (!res.ok) {
      return [];
    }
    const html = await res.text();
    const baseUrl = res.url || MARKET_NEWS_URL;
    const root = parse(html);
    const rows = root.querySelectorAll("table.s_news_list tr");
    type RowItem = { url: string; title: string; publishedAt: Date };
    const rowItems: RowItem[] = [];
    for (const row of rows) {
      const link = row.querySelector("a");
      const timeTag = row.querySelector("time");
      if (!link || !timeTag) continue;
      const dt = timeTag.getAttribute("datetime") || "";
      const publishedAt = new Date(dt);
      if (Number.isNaN(publishedAt.getTime())) continue;
      const url = toAbsoluteUrl(link.getAttribute("href") ?? undefined, baseUrl);
      const title = link.text.trim();
      if (!url || !title) continue;
      rowItems.push({ url, title, publishedAt });
    }
    // Keep only today's (JST) entries
    const todayKey = toJstDateKey(new Date());
    const todays = rowItems.filter((r) => toJstDateKey(r.publishedAt) === todayKey).slice(0, maxArticles);
    if (todays.length === 0) return [];

    const ignore = new Set(["0000", "0950", "0800", "0823"]);
    const results: NewsItem[] = [];
    for (const item of todays) {
      try {
        const article = await fetch(item.url, {
          cache: "no-store",
          headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "kabu4-api/1.0" }
        });
        if (!article.ok) continue;
        const raw = await article.text();
        const codes = Array.from(raw.matchAll(/\/stock\/\?code=(\d{4})/g))
          .map((m) => m[1])
          .filter((c) => !ignore.has(c));
        const uniqueCodes = Array.from(new Set(codes));
        for (const code of uniqueCodes) {
          results.push({
            code,
            title: item.title,
            summary: "",
            polarity: inferPolarity(item.title),
            publishedAt: item.publishedAt,
            url: item.url
          });
        }
      } catch {
        continue;
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchMinkabuNewsForToday(maxArticles = 25): Promise<NewsItem[]> {
  try {
    const res = await fetch(MINKABU_NEWS_URL, {
      cache: "no-store",
      headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "kabu4-api/1.0" }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const baseUrl = res.url || MINKABU_NEWS_URL;
    const root = parse(html);
    const links = root.querySelectorAll("a").map((a) => a.getAttribute("href") || "");
    const articlePaths = Array.from(
      new Set(
        links
          .filter((h) => /^\/news\/\d+/.test(h))
          .slice(0, maxArticles * 2)
      )
    );
    const results: NewsItem[] = [];
    for (const path of articlePaths.slice(0, maxArticles)) {
      try {
        const url = toAbsoluteUrl(path, baseUrl)!;
        const art = await fetch(url, {
          cache: "no-store",
          headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "kabu4-api/1.0" }
        });
        if (!art.ok) continue;
        const raw = await art.text();
        // Published time is not always clearly marked; use current JST for date grouping.
        const publishedAt = new Date();
        const titleMatch = raw.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/\s+\|.*$/, "").trim() : "ニュース";
        const codes = Array.from(raw.matchAll(/\/stock\/(\d{4})\b/g)).map((m) => m[1]);
        const uniqueCodes = Array.from(new Set(codes));
        for (const code of uniqueCodes) {
          results.push({
            code,
            title,
            summary: "",
            polarity: inferPolarity(title),
            publishedAt,
            url
          });
        }
      } catch {
        continue;
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function ensureSymbolsExist(codes: string[]): Promise<void> {
  const unique = Array.from(new Set(codes.filter((c) => /^\d{4}$/.test(c))));
  if (unique.length === 0) return;
  const existing = await prisma.symbol.findMany({ select: { code: true }, where: { code: { in: unique } } });
  const existingSet = new Set(existing.map((s) => s.code));
  const missing = unique.filter((c) => !existingSet.has(c));
  for (const code of missing) {
    try {
      const url = `https://kabutan.jp/stock/?code=${code}`;
      const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "kabu4-api/1.0" } });
      let name = code;
      if (res.ok) {
        const html = await res.text();
        const root = parse(html);
        const title = root.querySelector("title")?.text.trim() ?? "";
        if (title.includes("【")) {
          name = title.split("【")[0].trim();
        } else {
          // Fallback: try <h2><span>code</span> NAME</h2>
          const h2 = root.querySelector("h2");
          const text = h2?.text?.trim() ?? "";
          if (text) {
            const parts = text.split(/\s+/);
            if (parts.length > 1) name = parts.slice(1).join(" ");
          }
        }
      }
      await prisma.symbol.create({ data: { code, name, sector: null } });
    } catch {
      // ignore failures; next upsert may still fail if symbol missing
      continue;
    }
  }
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

function parseJsonNews(raw: string, baseUrl?: string): NewsItem[] {
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
        const url =
          toAbsoluteUrl(entry.url ?? entry.link ?? entry.href, baseUrl) ??
          toAbsoluteUrl(entry.articleUrl ?? entry.article_url, baseUrl);
        return {
          code,
          title,
          summary,
          polarity,
          publishedAt,
          url: url ?? undefined
        } satisfies NewsItem;
      })
      .filter((item): item is NewsItem => Boolean(item));
  } catch {
    return [];
  }
}

function parseHtmlNews(html: string, baseUrl?: string): NewsItem[] {
  const root = parse(html);
  const rows = root.querySelectorAll("table.s_news_list tr");
  const items: NewsItem[] = [];
  for (const row of rows) {
    const codeCell = row.querySelector("td.oncodetip_code-data1");
    const link = row.querySelector("a");
    if (!codeCell || !link) {
      continue;
    }
    const code = (codeCell.getAttribute("data-code") || codeCell.text).trim();
    if (!code) {
      continue;
    }
    const title = link.text.trim();
    if (!title) {
      continue;
    }
    const timeTag = row.querySelector("time");
    let publishedAt = new Date();
    if (timeTag) {
      const raw = timeTag.getAttribute("datetime") || "";
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        publishedAt = parsed;
      }
    }
    const url = toAbsoluteUrl(link.getAttribute("href") ?? undefined, baseUrl);
    items.push({
      code,
      title,
      summary: "",
      polarity: inferPolarity(title),
      publishedAt,
      url: url ?? undefined
    });
  }
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
  const baseUrl = response.url || feedUrl;
  if (contentType.includes("application/json")) {
    const items = parseJsonNews(raw, baseUrl);
    if (items.length > 0) {
      return items;
    }
  }
  const parsedJson = parseJsonNews(raw, baseUrl);
  if (parsedJson.length > 0) {
    return parsedJson;
  }
  return parseHtmlNews(raw, baseUrl);
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
  sources: string[];
}> {
  const primaryFeed = process.env.NEWS_FEED_URL;
  const extraFeeds = (process.env.NEWS_FEEDS || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allFeeds = Array.from(new Set([...(primaryFeed ? [primaryFeed] : []), ...extraFeeds]));

  let newsItems: NewsItem[] = [];
  // Try configured feeds first (multiple media supported via NEWS_FEEDS)
  for (const url of allFeeds) {
    try {
      const items = await fetchLiveNews(url);
      newsItems.push(...items);
    } catch (error) {
      console.warn("Failed to fetch configured feed:", url, error);
    }
  }
  // Add built-in cross-media scrapers (today only)
  try {
    const [kabutanMarket, minkabu] = await Promise.all([
      fetchMarketNewsForToday(20),
      fetchMinkabuNewsForToday(20)
    ]);
    newsItems.push(...kabutanMarket, ...minkabu);
  } catch (e) {
    console.warn("Built-in cross-media scraping failed", e);
  }
  if (newsItems.length === 0) {
    newsItems = await loadFallbackNews();
  }
  if (newsItems.length === 0) {
    // No items from configured feed; try market news as a same-day fallback
    newsItems = await fetchMarketNewsForToday();
  }
  if (newsItems.length > 0) {
    newsItems = filterNewsToLatestDay(newsItems);
  }
  if (newsItems.length === 0) {
    // Last chance: try market news explicitly when primary feed returned stale day
    const marketToday = await fetchMarketNewsForToday();
    if (marketToday.length > 0) {
      newsItems = marketToday;
    } else {
      throw new Error("本日のニュース情報が見つかりませんでした。フィードを確認してください。");
    }
  }

  // Dedupe by (code, dateKey, title)
  const seen = new Set<string>();
  newsItems = newsItems.filter((i) => {
    const key = `${i.code}::${toJstDateKey(i.publishedAt)}::${i.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Ensure referenced symbols exist before upserting events
  await ensureSymbolsExist(Array.from(new Set(newsItems.map((i) => i.code))));

  const eventsUpserted = await upsertNews(newsItems);
  const { date, picksCount } = await rebuildPicks();
  const sources = Array.from(
    new Set(
      newsItems
        .map((item) => item.url)
        .filter((url): url is string => Boolean(url))
    )
  );

  return {
    newsCount: newsItems.length,
    eventsUpserted,
    picksCount,
    date,
    sources
  };
}
