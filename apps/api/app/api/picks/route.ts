import { NextRequest } from "next/server";
import { fetchPicks } from "@/lib/picks";
import { picksQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parseResult = picksQuerySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    minScore: searchParams.get("minScore") ?? undefined,
    type: searchParams.get("type") ?? undefined
  });

  if (!parseResult.success) {
    return Response.json(
      {
        error: "Invalid query",
        details: parseResult.error.flatten()
      },
      { status: 400 }
    );
  }

  const payload = await fetchPicks(parseResult.data);
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "X-Kabu4-Requested-Date": payload.requestedDate,
      "X-Kabu4-Effective-Date": payload.date,
      "X-Kabu4-Date-Fallback": payload.fallbackApplied ? "1" : "0"
    }
  });
}
