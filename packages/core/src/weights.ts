import fs from "node:fs";
import path from "node:path";
import { weightConfigSchema, WeightConfig } from "./types.js";

type LoadWeightOptions = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
};

type WeightKey =
  | "WEIGHT_EVENT_GUIDE_UP"
  | "WEIGHT_EVENT_EARNINGS_POSITIVE"
  | "WEIGHT_EVENT_TDNET"
  | "WEIGHT_EVENT_VOL_SPIKE"
  | "WEIGHT_EVENT_NEWS_POS"
  | "WEIGHT_EVENT_NEWS_NEU"
  | "WEIGHT_EVENT_NEWS_NEG"
  | "WEIGHT_TAPE_VOLUME_Z"
  | "WEIGHT_TAPE_GAP_PCT"
  | "WEIGHT_TAPE_SUPPLY_DEMAND"
  | "MIN_SCORE";

const ENV_TO_PATH: Record<WeightKey, string> = {
  WEIGHT_EVENT_GUIDE_UP: "event.GUIDE_UP",
  WEIGHT_EVENT_EARNINGS_POSITIVE: "event.EARNINGS_POSITIVE",
  WEIGHT_EVENT_TDNET: "event.TDNET",
  WEIGHT_EVENT_VOL_SPIKE: "event.VOL_SPIKE",
  WEIGHT_EVENT_NEWS_POS: "event.NEWS_POS",
  WEIGHT_EVENT_NEWS_NEU: "event.NEWS_NEU",
  WEIGHT_EVENT_NEWS_NEG: "event.NEWS_NEG",
  WEIGHT_TAPE_VOLUME_Z: "tape.volume_z",
  WEIGHT_TAPE_GAP_PCT: "tape.gap_pct",
  WEIGHT_TAPE_SUPPLY_DEMAND: "tape.supply_demand_proxy",
  MIN_SCORE: "minScore"
};

function setDeep(target: WeightConfig, pathKey: string, value: number) {
  const [primary, secondary] = pathKey.split(".");
  if (!secondary) {
    // @ts-expect-error runtime assignment guarded by schema later
    target[primary] = value;
    return;
  }
  const inner = (target as Record<string, unknown>)[primary] as Record<string, number>;
  inner[secondary] = value;
}

function resolveConfigPath(explicit?: string): string {
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }
  const candidates = [
    explicit,
    path.join(process.cwd(), "config/weights.json"),
    path.join(process.cwd(), "../config/weights.json"),
    path.join(process.cwd(), "../../config/weights.json"),
    path.resolve("config/weights.json")
  ].filter(Boolean) as string[];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Unable to locate weights configuration. Looked into: ${candidates.join(", ")}`);
  }
  return found;
}

export function loadWeights(options: LoadWeightOptions = {}): WeightConfig {
  const env = options.env ?? process.env;
  const explicit = options.configPath ?? env.WEIGHT_CONFIG_PATH;
  const configPath = resolveConfigPath(explicit);
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw);
  const base = weightConfigSchema.parse(parsed);

  (Object.keys(ENV_TO_PATH) as WeightKey[]).forEach((envKey) => {
    const value = env[envKey];
    if (value === undefined) {
      return;
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      return;
    }
    setDeep(base, ENV_TO_PATH[envKey], num);
  });

  return weightConfigSchema.parse(base);
}
