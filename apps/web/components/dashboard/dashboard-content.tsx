"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PickItem, PicksResponse } from "@/lib/api";
import { fetchPicks } from "@/lib/api";
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

  const items = useMemo(() => data.items, [data.items]);

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        eventTypes={EVENT_TYPES}
        onChange={onFilterChange}
        weights={data.weights}
      />
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
