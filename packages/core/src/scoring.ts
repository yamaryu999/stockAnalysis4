import { scoringInputSchema, ScoreReason, ScoreResult, ScoringInput } from "./types.js";

const GAP_PCT_MAX = 0.05; // 5% gap -> fully normalized
const SUPPLY_DEMAND_MAX = 2; // double 20-day average
const VOLUME_Z_MAX = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeTape(input: ScoringInput["tape"]) {
  const reasons: ScoreReason[] = [];
  let weightSum = 0;
  let weightedTotal = 0;

  if (typeof input.volumeZ === "number") {
    const normalized = clamp(input.volumeZ, 0, VOLUME_Z_MAX) / VOLUME_Z_MAX;
    reasons.push({
      kind: "tape",
      tag: "volume_z",
      weight: 0,
      applied: normalized,
      details: { raw: input.volumeZ }
    });
    weightedTotal += normalized;
    weightSum += 1;
  }

  if (typeof input.gapPct === "number") {
    const normalized = clamp(input.gapPct, 0, GAP_PCT_MAX) / GAP_PCT_MAX;
    reasons.push({
      kind: "tape",
      tag: "gap_pct",
      weight: 0,
      applied: normalized,
      details: { raw: input.gapPct }
    });
    weightedTotal += normalized;
    weightSum += 1;
  }

  if (typeof input.supplyDemandProxy === "number") {
    const normalized = clamp(input.supplyDemandProxy, 0, SUPPLY_DEMAND_MAX) / SUPPLY_DEMAND_MAX;
    reasons.push({
      kind: "tape",
      tag: "supply_demand_proxy",
      weight: 0,
      applied: normalized,
      details: { raw: input.supplyDemandProxy }
    });
    weightedTotal += normalized;
    weightSum += 1;
  }

  const avg = weightSum > 0 ? weightedTotal / weightSum : 0;
  return { normalized: avg, reasons };
}

export function calculateScore(input: ScoringInput): ScoreResult {
  const parsed = scoringInputSchema.parse(input);
  const reasons: ScoreReason[] = [];
  let weightedTotal = 0;
  let weightSum = 0;

  const tape = normalizeTape(parsed.tape);
  if (tape.reasons.length > 0) {
    let tapeWeightUsed = 0;
    tape.reasons.forEach((reason) => {
      const tagWeight = (parsed.weights.tape as Record<string, number>)[reason.tag] ?? 0;
      if (tagWeight === 0) {
        return;
      }
      reasons.push({
        ...reason,
        weight: tagWeight,
        applied: reason.applied * tagWeight
      });
      weightedTotal += reason.applied * tagWeight;
      tapeWeightUsed += tagWeight;
    });
    weightSum += tapeWeightUsed;
  }

  parsed.events.forEach((event) => {
    const weight = parsed.weights.event[event.tag];
    const normalized = typeof event.score === "number" ? clamp(event.score, 0, 1) : 1;
    const multiplier = event.weightMultiplier ?? 1;
    const appliedWeight = weight * multiplier;
    if (appliedWeight === 0) {
      return;
    }
    reasons.push({
      kind: "event",
      tag: event.tag,
      weight: appliedWeight,
      applied: normalized * appliedWeight,
      details: {
        source: event.source,
        title: event.title,
        occurredAt: event.occurredAt.toISOString()
      }
    });
    weightedTotal += normalized * appliedWeight;
    weightSum += appliedWeight;
  });

  if (weightSum === 0) {
    return {
      raw: 0,
      normalized: 0,
      passedFilters: false,
      reasons: [
        ...reasons,
        {
          kind: "filter",
          tag: "missing_signals",
          weight: 0,
          applied: 0,
          details: { message: "No signals available to score" }
        }
      ]
    };
  }

  const baseScore = weightedTotal / weightSum;
  const penalty = clamp(parsed.penalties.recentNegative ?? 0, 0, 1);
  if (penalty > 0) {
    reasons.push({
      kind: "penalty",
      tag: "recent_negative_event",
      weight: penalty,
      applied: -penalty,
      details: {}
    });
  }
  const penalized = Math.max(baseScore - penalty, 0);

  let passedFilters = true;
  if (typeof parsed.tape.high20dDistPct === "number" && parsed.tape.high20dDistPct < -0.15) {
    passedFilters = false;
    reasons.push({
      kind: "filter",
      tag: "high20d_dist_pct",
      weight: 0,
      applied: 0,
      details: { value: parsed.tape.high20dDistPct }
    });
  }

  if (typeof parsed.tape.close === "number" && parsed.tape.close < 100) {
    passedFilters = false;
    reasons.push({
      kind: "filter",
      tag: "close_price",
      weight: 0,
      applied: 0,
      details: { value: parsed.tape.close }
    });
  }

  const normalized = passedFilters ? clamp(penalized, 0, 1) * 100 : 0;

  return {
    raw: penalized,
    normalized,
    passedFilters,
    reasons
  };
}
