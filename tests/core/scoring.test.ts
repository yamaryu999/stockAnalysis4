import { describe, expect, it } from "vitest";
import { calculateScore, WeightConfig } from "@kabu4/core";

const weights: WeightConfig = {
  event: {
    GUIDE_UP: 1,
    EARNINGS_POSITIVE: 0.8,
    TDNET: 0.5,
    VOL_SPIKE: 0.6,
    NEWS_POS: 0.4,
    NEWS_NEU: 0.2,
    NEWS_NEG: 0.1
  },
  tape: {
    volume_z: 0.4,
    gap_pct: 0.3,
    supply_demand_proxy: 0.3
  },
  minScore: 60
};

describe("calculateScore", () => {
  it("returns higher score when strong signals present", () => {
    const result = calculateScore({
      weights,
      tape: {
        volumeZ: 4,
        gapPct: 0.03,
        supplyDemandProxy: 1.4,
        high20dDistPct: -0.05,
        close: 200
      },
      events: [
        {
          tag: "GUIDE_UP",
          type: "GUIDE_UP",
          title: "上方修正のお知らせ",
          summary: "業績上方修正",
          source: "tdnet",
          occurredAt: new Date("2024-02-01T00:00:00Z")
        }
      ],
      penalties: { recentNegative: 0 }
    });

    expect(result.passedFilters).toBe(true);
    expect(result.normalized).toBeGreaterThan(70);
  });

  it("fails filters when price conditions not met", () => {
    const result = calculateScore({
      weights,
      tape: {
        volumeZ: 2,
        gapPct: 0.01,
        supplyDemandProxy: 1.1,
        high20dDistPct: -0.2,
        close: 80
      },
      events: [],
      penalties: { recentNegative: 0.3 }
    });

    expect(result.passedFilters).toBe(false);
    expect(result.normalized).toBe(0);
    expect(result.reasons.some((reason) => reason.kind === "filter")).toBe(true);
  });
});
