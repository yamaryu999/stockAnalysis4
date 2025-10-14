import { z } from "zod";

export const eventTypeSchema = z.enum([
  "EARNINGS",
  "GUIDE_UP",
  "TDNET",
  "NEWS",
  "VOL_SPIKE"
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export const eventTagSchema = z.enum([
  "GUIDE_UP",
  "EARNINGS_POSITIVE",
  "TDNET",
  "VOL_SPIKE",
  "NEWS_POS",
  "NEWS_NEU",
  "NEWS_NEG"
]);

export type EventTag = z.infer<typeof eventTagSchema>;

export const eventSignalSchema = z.object({
  tag: eventTagSchema,
  type: eventTypeSchema,
  title: z.string(),
  summary: z.string().optional(),
  source: z.string(),
  score: z.number().min(0).max(1).optional(),
  weightMultiplier: z.number().positive().optional(),
  occurredAt: z.date()
});

export type EventSignal = z.infer<typeof eventSignalSchema>;

export const tapeSignalSchema = z.object({
  volumeZ: z.number().optional(),
  gapPct: z.number().optional(),
  vwapDeviationPct: z.number().optional(),
  supplyDemandProxy: z.number().optional(),
  high20dDistPct: z.number().optional(),
  close: z.number().optional()
});

export type TapeSignal = z.infer<typeof tapeSignalSchema>;

export const eventWeightSchema = z.object({
  GUIDE_UP: z.number().nonnegative(),
  EARNINGS_POSITIVE: z.number().nonnegative(),
  TDNET: z.number().nonnegative(),
  VOL_SPIKE: z.number().nonnegative(),
  NEWS_POS: z.number().nonnegative(),
  NEWS_NEU: z.number().nonnegative(),
  NEWS_NEG: z.number().nonnegative()
});

export const weightConfigSchema = z.object({
  event: eventWeightSchema,
  tape: z.object({
    volume_z: z.number().nonnegative(),
    gap_pct: z.number().nonnegative(),
    supply_demand_proxy: z.number().nonnegative()
  }),
  minScore: z.number().min(0).max(100)
});

export type WeightConfig = z.infer<typeof weightConfigSchema>;
export type EventWeightConfig = z.infer<typeof eventWeightSchema>;

export const scoreReasonSchema = z.object({
  kind: z.enum(["event", "tape", "penalty", "filter"]),
  tag: z.string(),
  weight: z.number(),
  applied: z.number(),
  details: z.record(z.string(), z.unknown()).optional()
});

export type ScoreReason = z.infer<typeof scoreReasonSchema>;

export const scoreResultSchema = z.object({
  raw: z.number(),
  normalized: z.number(),
  passedFilters: z.boolean(),
  reasons: z.array(scoreReasonSchema)
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

export const scoringInputSchema = z.object({
  tape: tapeSignalSchema,
  events: z.array(eventSignalSchema),
  weights: weightConfigSchema,
  penalties: z.object({
    recentNegative: z.number().min(0).max(1).default(0)
  }).default({ recentNegative: 0 })
});

export type ScoringInput = z.infer<typeof scoringInputSchema>;
