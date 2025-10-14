import { eventTypeSchema } from "@kabu4/core";
import { z } from "zod";

export const picksQuerySchema = z.object({
  date: z
    .string()
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "date must be YYYY-MM-DD"
    }),
  minScore: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(
      z
        .number()
        .min(0)
        .max(100)
        .optional()
    ),
  type: z
    .string()
    .optional()
    .transform((value) => (value ? value.toUpperCase() : undefined))
    .pipe(eventTypeSchema.optional())
});

export const eventsQuerySchema = z.object({
  code: z
    .string()
    .min(1)
    .transform((value) => value.toUpperCase()),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.number().min(1).max(100).optional())
});
