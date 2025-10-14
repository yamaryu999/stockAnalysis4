"use client";

import { memo } from "react";
import type { PickItem } from "@/lib/api";
import { t } from "@/lib/i18n";

type Props = {
  items: PickItem[];
  loading: boolean;
  onSelect: (item: PickItem) => void;
};

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return value.toFixed(2);
}

function PicksTableComponent({ items, loading, onSelect }: Props) {
  return (
    <div className="overflow-hidden rounded border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800">
        <thead className="bg-surface-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">{t("dashboard.table.code")}</th>
            <th className="px-4 py-3">{t("dashboard.table.name")}</th>
            <th className="px-4 py-3 text-right">{t("dashboard.table.score")}</th>
            <th className="px-4 py-3 text-right">{t("dashboard.table.volumeZ")}</th>
            <th className="px-4 py-3 text-right">{t("dashboard.table.gapPct")}</th>
            <th className="px-4 py-3 text-right">{t("dashboard.table.sdProxy")}</th>
            <th className="px-4 py-3 text-right">{t("dashboard.table.high20d")}</th>
            <th className="px-4 py-3 text-right">{t("dashboard.table.close")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900 text-sm">
          {loading ? (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                Loading...
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={`${item.code}-${item.score}`}
                className="cursor-pointer bg-surface transition hover:bg-surface-200/60"
                onClick={() => onSelect(item)}
              >
                <td className="px-4 py-3 font-semibold text-slate-100">{item.code}</td>
                <td className="px-4 py-3 text-slate-300">{item.name}</td>
                <td className="px-4 py-3 text-right text-accent">{item.score.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(item.stats.volume_z ?? null)}</td>
                <td className="px-4 py-3 text-right">{formatPercent(item.stats.gap_pct ?? null)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(item.stats.supply_demand_proxy ?? null)}</td>
                <td className="px-4 py-3 text-right">{formatPercent(item.high20dDistPct ?? null)}</td>
                <td className="px-4 py-3 text-right">{item.lastClose?.toFixed(1) ?? "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const PicksTable = memo(PicksTableComponent);

export default PicksTable;
