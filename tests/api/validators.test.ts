import { describe, expect, it } from "vitest";
import { picksQuerySchema } from "../../apps/api/lib/validators";

describe("picksQuerySchema", () => {
  it("parses valid query", () => {
    const result = picksQuerySchema.parse({ date: "2024-02-01", minScore: "70", type: "news" });
    expect(result).toEqual({ date: "2024-02-01", minScore: 70, type: "NEWS" });
  });

  it("rejects invalid date", () => {
    expect(() => picksQuerySchema.parse({ date: "2024/02/01" })).toThrow();
  });
});
