"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PickItem, PicksResponse } from "@/lib/api";
import { fetchPicks, refreshNews } from "@/lib/api";
import { t } from "@/lib/i18n";
import FilterBar, { FilterState } from "./filter-bar";
import PicksTable from "./picks-table";
import SymbolDrawer from "./symbol-drawer";

const EVENT_TYPES = [
  { value: "", label: "ALL" },
  { value: "GUIDE_UP", label: "GUIDE_UP" },
  { value: "EARNINGS", label: "EARNINGS" },
  { value: "TDNET", label: "TDNET" },
  { value: "NEWS", label: "NEWS" },
  { value: "VOL_SPIKE", label: "VOL_SPIKE" }
];

type Props = {
  initialData: PicksResponse;
  initialFilters: FilterState;
};

export default function DashboardContent({ initialData, initialFilters }: Props) {
  const [data, setData] = useState<PicksResponse>(initialData);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selected, setSelected] = useState<PickItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
    sources?: string[];
  } | null>(null);
  const router = useRouter();

  const updateUrl = useCallback((nextFilters: FilterState) => {
    const params = new URLSearchParams();
    params.set("date", nextFilters.date);
    params.set("minScore", String(nextFilters.minScore));
    if (nextFilters.type) {
      params.set("type", nextFilters.type);
    }
    router.replace(`/dashboard?${params.toString()}`);
  }, [router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("kabu4-settings");
      if (!raw) {
        return;
      }
      const settings = JSON.parse(raw) as { minScore?: number };
      if (typeof settings.minScore === "number") {
        const persisted = settings.minScore as number;
        setFilters((prev): FilterState => {
          const nextFilters: FilterState = {
            ...prev,
            minScore: persisted
          };
          updateUrl(nextFilters);
          return nextFilters;
        });
      }
    } catch (error) {
      console.warn("Failed to read persisted settings", error);
    }
  }, [updateUrl]);

  useEffect(() => {
    setLoading(true);
    fetchPicks({
      date: filters.date,
      minScore: filters.minScore,
      type: filters.type
    })
      .then((response) => {
        setData(response);
      })
      .finally(() => setLoading(false));
  }, [filters.date, filters.minScore, filters.type]);

  const onFilterChange = useCallback(
    (next: FilterState) => {
      setFilters(next);
      updateUrl(next);
    },
    [updateUrl]
  );

  const handleApplyLatestDate = useCallback(() => {
    if (data.date === filters.date) {
      return;
    }
    onFilterChange({
      ...filters,
      date: data.date
    });
  }, [data.date, filters, onFilterChange]);

  const handleRefreshNews = useCallback(async () => {
    setRefreshing(true);
    setStatus(null);
    setLoading(true);
    try {
      const result = await refreshNews();
      const updated = await fetchPicks({
        date: filters.date,
        minScore: filters.minScore,
        type: filters.type
      });
      setData(updated);
      setStatus({
        type: "success",
        message: `${t("dashboard.refresh.success")} (${result.date})`,
        sources: result.sources
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("dashboard.refresh.error");
      setStatus({ type: "error", message });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [filters.date, filters.minScore, filters.type]);

  const items = useMemo(() => data.items, [data.items]);

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        eventTypes={EVENT_TYPES}
        onChange={onFilterChange}
        weights={data.weights}
        onRefreshNews={handleRefreshNews}
        refreshing={refreshing}
      />
      {status ? (
        <div
          className={`rounded border px-4 py-2 text-xs ${status.type === "success" ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-100" : "border-rose-500/40 bg-rose-900/20 text-rose-100"}`}
        >
          <p>{status.message}</p>
          {status.type === "success" && status.sources && status.sources.length > 0 ? (
            <div className="mt-2 space-y-1">
              <p className="font-medium">{t("dashboard.refresh.sourcesHeading")}</p>
              <ul className="list-inside list-disc space-y-1">
                {status.sources.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-emerald-200"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {data.fallbackApplied && data.requestedDate !== data.date ? (
        <div className="rounded border border-amber-500/40 bg-amber-900/30 px-4 py-3 text-xs text-amber-100">
          <p className="mb-2">
            指定した日付（{data.requestedDate}）にデータが見つからなかったため、直近の {data.date} を表示しています。
          </p>
          <button
            type="button"
            onClick={handleApplyLatestDate}
            disabled={filters.date === data.date || loading}
            className="rounded border border-amber-400/60 px-3 py-1 font-medium text-amber-100 transition hover:border-amber-300 hover:bg-amber-900/60 disabled:opacity-50"
          >
            フィルタを最新日付に合わせる
          </button>
        </div>
      ) : null}
      {items.length === 0 && !loading ? (
        <div className="rounded border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
          {t("dashboard.empty")}
        </div>
      ) : (
        <PicksTable
          items={items}
          loading={loading}
          onSelect={(item) => setSelected(item)}
        />
      )}
      <SymbolDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
