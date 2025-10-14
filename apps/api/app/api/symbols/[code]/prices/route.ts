import { NextRequest } from "next/server";
import { fetchSymbolPrices } from "@/lib/prices";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: { code: string } }) {
  const code = context.params.code;
  try {
    const prices = await fetchSymbolPrices(code);
    return Response.json(
      { code, prices },
      {
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (error) {
    return Response.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}

