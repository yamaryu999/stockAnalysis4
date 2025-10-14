import { NextRequest } from "next/server";
import { fetchSymbolEvents } from "@/lib/events";
import { eventsQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: { code: string } }) {
  const { searchParams } = new URL(request.url);
  const parseResult = eventsQuerySchema.safeParse({
    code: context.params.code,
    limit: searchParams.get("limit") ?? undefined
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

  const payload = await fetchSymbolEvents(parseResult.data);
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
