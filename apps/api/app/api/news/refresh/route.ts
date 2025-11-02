import { NextResponse } from "next/server";
import { refreshNewsAndPicks } from "@/lib/news-refresh";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
} as const;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function POST() {
  try {
    const result = await refreshNewsAndPicks();
    return NextResponse.json(result, {
      status: 200,
      headers: CORS_HEADERS
    });
  } catch (error) {
    console.error("Failed to refresh news:", error);
    return NextResponse.json(
      {
        error: "ニュースの更新に失敗しました。"
      },
      {
        status: 500,
        headers: CORS_HEADERS
      }
    );
  }
}
