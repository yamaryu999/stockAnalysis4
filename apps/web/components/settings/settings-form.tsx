"use client";

import { useCallback, useEffect, useState } from "react";
import type { WeightConfig } from "@kabu4/core";
import { t } from "@/lib/i18n";

const STORAGE_KEY = "kabu4-settings";

type SettingsState = {
  minScore: number;
  event: Record<string, number>;
  tape: Record<string, number>;
};

function toState(weights: WeightConfig): SettingsState {
  return {
    minScore: weights.minScore,
    event: { ...weights.event },
    tape: { ...weights.tape }
  };
}

type Props = {
  defaults: WeightConfig;
};

export default function SettingsForm({ defaults }: Props) {
  const [state, setState] = useState<SettingsState>(() => toState(defaults));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as SettingsState;
      setState(parsed);
    } catch (error) {
      console.warn("Failed to parse settings", error);
    }
  }, []);

  const handleNumberChange = useCallback((bucket: "event" | "tape" | "minScore", key: string, value: number) => {
    setState((prev) => {
      if (bucket === "minScore") {
        return { ...prev, minScore: value };
      }
      return {
        ...prev,
        [bucket]: {
          ...prev[bucket],
          [key]: value
        }
      };
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaved(true);
  }, [state]);

  const handleReset = useCallback(() => {
    setState(toState(defaults));
    localStorage.removeItem(STORAGE_KEY);
    setSaved(false);
  }, [defaults]);

  return (
    <form
      className="space-y-6 rounded border border-slate-800 bg-surface-100 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <section className="space-y-4">
        <div>
          <label htmlFor="minScore" className="block text-sm text-slate-300">
            {t("settings.minScore")}: {state.minScore}
          </label>
          <input
            id="minScore"
            type="range"
            min={0}
            max={100}
            value={state.minScore}
            onChange={(event) => handleNumberChange("minScore", "minScore", Number(event.target.value))}
            className="w-full"
          />
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Event Weights</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(state.event).map(([key, value]) => (
            <label key={key} className="flex items-center justify-between rounded border border-slate-800 bg-surface px-3 py-2 text-sm">
              <span>{key}</span>
              <input
                type="number"
                step="0.1"
                value={value}
                onChange={(event) => handleNumberChange("event", key, Number(event.target.value))}
                className="w-20 rounded border border-slate-700 bg-surface-200 px-2 py-1 text-right text-slate-100"
              />
            </label>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Tape Weights</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(state.tape).map(([key, value]) => (
            <label key={key} className="flex items-center justify-between rounded border border-slate-800 bg-surface px-3 py-2 text-sm">
              <span>{key}</span>
              <input
                type="number"
                step="0.1"
                value={value}
                onChange={(event) => handleNumberChange("tape", key, Number(event.target.value))}
                className="w-20 rounded border border-slate-700 bg-surface-200 px-2 py-1 text-right text-slate-100"
              />
            </label>
          ))}
        </div>
      </section>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{saved ? t("settings.saved") : ""}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            {t("settings.reset")}
          </button>
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
          >
            保存
          </button>
        </div>
      </div>
    </form>
  );
}
