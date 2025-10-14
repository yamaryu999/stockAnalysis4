"use client";

import { useEffect, useMemo, useState } from "react";
import type { PickItem } from "@/lib/api";
import { fetchSymbolEvents, fetchSymbolPrices } from "@/lib/api";
import { t } from "@/lib/i18n";
import PriceChart from "./price-chart";

type Props = {
  item: PickItem | null;
  onClose: () => void;
};

type DrawerData = {
  events: Array<{
    id: string;
    date: string;
    type: string;
    title: string;
    summary: string | null;
  }>;
  prices: Array<{
    date: string;
    close: number;
  }>;
};

const initialState: DrawerData = {
  events: [],
  prices: []
};

export default function SymbolDrawer({ item, onClose }: Props) {
  const [data, setData] = useState<DrawerData>(initialState);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) {
      setData(initialState);
      return;
    }
    setLoading(true);
    Promise.all([fetchSymbolEvents(item.code), fetchSymbolPrices(item.code)])
      .then(([eventsPayload, pricesPayload]) => {
        setData({
          events: eventsPayload.events,
          prices: pricesPayload.prices.map((price) => ({ date: price.date, close: price.close }))
        });
      })
      .finally(() => setLoading(false));
  }, [item]);

  const metrics = useMemo(() => {
    if (!item) {
      return [];
    }
    return [
      { label: t("dashboard.drawer.stats.volumeZ"), value: item.stats.volume_z?.toFixed(2) ?? "-" },
      {
        label: t("dashboard.drawer.stats.gapPct"),
        value:
          item.stats.gap_pct !== null && item.stats.gap_pct !== undefined
            ? `${(item.stats.gap_pct * 100).toFixed(2)}%`
            : "-"
      },
      {
        label: t("dashboard.drawer.stats.sdProxy"),
        value: item.stats.supply_demand_proxy?.toFixed(2) ?? "-"
      },
      {
        label: t("dashboard.drawer.stats.high20d"),
        value:
          item.high20dDistPct !== null && item.high20dDistPct !== undefined
            ? `${(item.high20dDistPct * 100).toFixed(2)}%`
            : "-"
      }
    ];
  }, [item]);

  const isOpen = Boolean(item);
  if (!isOpen) {
    return null;
  }

  return (
    <aside className="fixed inset-y-0 right-0 w-full max-w-xl border-l border-slate-800 bg-surface-200/95 backdrop-blur-lg shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold">{item?.code}</h3>
          <p className="text-sm text-slate-400">{item?.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
        >
          閉じる
        </button>
      </div>
      <div className="space-y-6 overflow-y-auto px-6 py-6">
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-300">{t("dashboard.drawer.metrics")}</h4>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded bg-surface px-3 py-2">
                <dt className="text-slate-500">{metric.label}</dt>
                <dd className="text-slate-100">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-300">チャート</h4>
          {loading ? <div>Loading chart...</div> : <PriceChart data={data.prices} />}
        </section>
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-300">{t("dashboard.drawer.events")}</h4>
          <ul className="space-y-3 text-sm">
            {(item?.events ?? []).map((event) => (
              <li key={event.id} className="rounded border border-slate-700 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{event.type}</span>
                  <span>{event.date.substring(0, 10)}</span>
                </div>
                <p className="mt-1 font-medium text-slate-200">{event.title}</p>
                {event.summary && <p className="mt-1 text-slate-400">{event.summary}</p>}
              </li>
            ))}
            {data.events
              .filter((event) => !(item?.events ?? []).some((existing) => existing.id === event.id))
              .map((event) => (
                <li key={event.id} className="rounded border border-dashed border-slate-700 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{event.type}</span>
                    <span>{event.date.substring(0, 10)}</span>
                  </div>
                  <p className="mt-1 font-medium text-slate-200">{event.title}</p>
                  {event.summary && <p className="mt-1 text-slate-400">{event.summary}</p>}
                </li>
              ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
