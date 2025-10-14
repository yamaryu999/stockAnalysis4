import { prisma } from "./prisma";
import { eventsQuerySchema } from "./validators";

export async function fetchSymbolEvents(params: { code: string; limit?: number }) {
  const filters = eventsQuerySchema.parse({
    code: params.code,
    limit: params.limit?.toString()
  });

  const events = await prisma.corporateEvent.findMany({
    where: {
      code: filters.code
    },
    orderBy: {
      date: "desc"
    },
    take: filters.limit ?? 20
  });

  return {
    code: filters.code,
    events: events.map((event) => ({
      id: event.id,
      date: event.date.toISOString(),
      type: event.type,
      title: event.title,
      summary: event.summary,
      source: event.source,
      score_raw: event.scoreRaw
    }))
  };
}
