import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { vi } from "vitest";
import { z } from "zod";
import { createTRPCContext } from "#lib/index.js";

export function createSsrRouter() {
  const t = initTRPC.create({ transformer: superjson });
  const calls = vi.fn<(input: unknown) => void>();
  let version = 0;
  const appRouter = t.router({
    post: t.router({
      byDay: t.procedure
        .input(z.object({ day: z.date(), slow: z.boolean().optional() }))
        .query(async (opts) => {
          calls(opts.input);
          version++;
          if (opts.input.slow === true) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          return {
            title: `Posts on ${opts.input.day.toISOString().slice(0, 10)}`,
            version,
            fetchedAt: new Date(0),
          };
        }),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => {
          calls(opts.input);
          const cursor = opts.input.cursor ?? 0;
          return { items: [cursor, cursor + 1], nextCursor: cursor + 2 };
        }),
      missing: t.procedure.query(() => {
        throw new TRPCError({ code: "NOT_FOUND" });
      }),
    }),
  });
  return { appRouter, calls };
}

export type SsrRouter = ReturnType<typeof createSsrRouter>["appRouter"];

export const ssrContext = createTRPCContext<SsrRouter>();
