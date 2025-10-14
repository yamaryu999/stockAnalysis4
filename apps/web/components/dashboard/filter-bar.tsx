"use client";

import { useCallback } from "react";
import type { WeightConfig } from "@kabu4/core";
import { t } from "@/lib/i18n";

export type FilterState = {
  date: string;
  minScore: number;
  type?: string;
};

type EventTypeOption = {
  value: string;
  label: string;
};

type Props = {
  filters: FilterState;
  eventTypes: EventTypeOption[];
  weights: WeightConfig;
  onChange: (next: FilterState) => void;
};

export default function FilterBar({ filters, eventTypes, weights, onChange }: Props) {
  const handleChange = useCallback(
    (patch: Partial<FilterState>) => {
      onChange({
        ...filters,
        ...patch
      });
    },
    [filters, onChange]
  );

  return (
    <section className="flex flex-wrap items-end justify-between gap-4 rounded border border-slate-800 bg-surface-100 p-4">
      <div className="flex flex-1 gap-4">
        <div className="flex flex-col text-sm">
          <label htmlFor="filter-date" className="mb-1 text-slate-400">
            日付
          </label>
          <input
            id="filter-date"
            type="date"
            value={filters.date}
            onChange={(event) => handleChange({ date: event.target.value })}
            className="rounded border border-slate-700 bg-surface-200 px-3 py-2 text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-col text-sm">
          <label htmlFor="filter-event" className="mb-1 text-slate-400">
            {t("dashboard.filters.eventType")}
          </label>
          <select
            id="filter-event"
            value={filters.type ?? ""}
            onChange={(event) => handleChange({ type: event.target.value || undefined })}
            className="rounded border border-slate-700 bg-surface-200 px-3 py-2 text-slate-100 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {eventTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label || "ALL"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col text-sm">
          <label htmlFor="filter-score" className="mb-1 text-slate-400">
            {t("dashboard.filters.minScore")}: {filters.minScore}
          </label>
          <input
            id="filter-score"
            type="range"
            min={0}
            max={100}
            value={filters.minScore}
            onChange={(event) => handleChange({ minScore: Number(event.target.value) })}
            className="w-56"
          />
        </div>
      </div>
      <div className="flex flex-col text-xs text-slate-500">
        <span>
          {t("settings.minScore")}: {weights.minScore}
        </span>
        <span>
          event weights: {Object.entries(weights.event).map(([key, value]) => `${key}:${value}`).join(" ")}
        </span>
      </div>
    </section>
  );
}
