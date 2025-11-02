"use client";

import { memo } from "react";
import type { PickItem } from "@/lib/api";
import type { ScoreReason } from "@kabu4/core";
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

function getTopReasons(reasons: unknown[], limit = 3): Array<{ label: string; applied: number }> {
  const casted = Array.isArray(reasons) ? (reasons as ScoreReason[]) : [];
  const items = casted
    .filter((r) => r && typeof r === "object" && typeof (r as ScoreReason).applied === "number")
    .map((r) => {
      const label = `${r.kind}:${r.tag}`;
      return { label, applied: r.applied };
    })
    .sort((a, b) => Math.abs(b.applied) - Math.abs(a.applied))
    .slice(0, limit);
  return items;
}

function ReasonsCell({ reasons }: { reasons: unknown[] }) {
  const top = getTopReasons(reasons);
  if (top.length === 0) {
    return <span className="text-slate-500">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {top.map((r) => {
        const sign = r.applied >= 0 ? "+" : "";
        const tone = r.applied >= 0 ? "bg-emerald-900/30 text-emerald-100 border-emerald-600/30" : "bg-rose-900/30 text-rose-100 border-rose-600/30";
        return (
          <span key={`${r.label}-${r.applied}`} className={`rounded border px-2 py-0.5 text-[10px] ${tone}`}>
            {r.label} {sign}{r.applied.toFixed(2)}
          </span>
        );
      })}
    </div>
  );
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
            <th className="px-4 py-3">{t("dashboard.table.reasons")}</th>
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
              <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
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
                <td className="px-4 py-3"><ReasonsCell reasons={item.reasons} /></td>
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
