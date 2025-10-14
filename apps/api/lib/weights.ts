import { WeightConfig, loadWeights } from "@kabu4/core";

let cached: WeightConfig | null = null;

export function getWeights(): WeightConfig {
  if (!cached) {
    cached = loadWeights();
  }
  return cached;
}

export function refreshWeights(): WeightConfig {
  cached = loadWeights();
  return cached;
}
