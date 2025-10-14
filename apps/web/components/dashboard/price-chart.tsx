"use client";

import { useEffect, useRef } from "react";
import { BusinessDay, createChart, IChartApi, ISeriesApi } from "lightweight-charts";

type Props = {
  data: Array<{ date: string; close: number }>;
};

export default function PriceChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 240,
      layout: {
        background: { color: "rgba(11,13,18,0)" },
        textColor: "#cbd5f5"
      },
      grid: {
        horzLines: { color: "#1f2933" },
        vertLines: { color: "#1f2933" }
      },
      timeScale: {
        borderColor: "#334155"
      },
      rightPriceScale: {
        borderColor: "#334155"
      }
    });
    const areaSeries = chart.addAreaSeries({
      lineColor: "#4f46e5",
      topColor: "rgba(79,70,229,0.4)",
      bottomColor: "rgba(79,70,229,0.05)"
    });
    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const handleResize = () => {
      if (!containerRef.current || !chartRef.current) {
        return;
      }
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }
    const lineData = data.map((point) => {
      const [year, month, day] = point.date.substring(0, 10).split("-").map(Number);
      const businessDay: BusinessDay = { year, month, day };
      return {
        time: businessDay,
        value: point.close
      };
    });
    seriesRef.current.setData(lineData);
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
          chartRef.current?.applyOptions({ width: entry.contentRect.width });
      });
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="w-full" />;
}
