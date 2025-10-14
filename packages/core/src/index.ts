export type {
  EventSignal,
  EventTag,
  EventType,
  EventWeightConfig,
  ScoringInput,
  ScoreReason,
  ScoreResult,
  TapeSignal,
  WeightConfig
} from "./types.js";
export { calculateScore } from "./scoring.js";
export { loadWeights } from "./weights.js";
export {
  eventSignalSchema,
  eventTagSchema,
  eventTypeSchema,
  eventWeightSchema,
  scoringInputSchema,
  scoreReasonSchema,
  scoreResultSchema,
  tapeSignalSchema,
  weightConfigSchema
} from "./types.js";
