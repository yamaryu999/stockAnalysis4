import { EventType, WeightConfig } from "@kabu4/core";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export type PicksQuery = {
  date: string;
  minScore?: number;
  type?: string;
};

export type PickItem = {
  code: string;
  name: string;
  score: number;
  reasons: unknown[];
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
  items: PickItem[];
  weights: WeightConfig;
};

export type RefreshNewsResponse = {
  newsCount: number;
  eventsUpserted: number;
  picksCount: number;
  date: string;
  sources: string[];
};

export async function fetchPicks(query: PicksQuery): Promise<PicksResponse> {
  const params = new URLSearchParams();
  params.set("date", query.date);
  if (query.minScore !== undefined) {
    params.set("minScore", String(query.minScore));
  }
  if (query.type) {
    params.set("type", query.type);
  }
  const response = await fetch(`${API_BASE}/api/picks?${params.toString()}`, {
    next: { revalidate: 0 }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch picks (${response.status})`);
  }
  return response.json() as Promise<PicksResponse>;
}

export async function refreshNews(): Promise<RefreshNewsResponse> {
  const response = await fetch(`${API_BASE}/api/news/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = error?.error ?? `Failed to refresh news (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<RefreshNewsResponse>;
}

export async function fetchSymbolEvents(code: string) {
  const response = await fetch(`${API_BASE}/api/symbols/${code}/events`, {
    next: { revalidate: 0 }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch events (${response.status})`);
  }
  return response.json() as Promise<{
    code: string;
    events: Array<{
      id: string;
      date: string;
      type: EventType;
      title: string;
      summary: string | null;
      source: string;
      score_raw: number | null;
    }>;
  }>;
}

export async function fetchSymbolPrices(code: string) {
  const response = await fetch(`${API_BASE}/api/symbols/${code}/prices`, {
    next: { revalidate: 0 }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch prices (${response.status})`);
  }
  return response.json() as Promise<{
    code: string;
    prices: Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  }>;
}
