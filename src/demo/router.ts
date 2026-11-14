import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

const t = initTRPC.create({ transformer: superjson });

const counter = { value: 0 };

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const appRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => ({ text: `Hello, ${opts.input.name}`, at: new Date(0) })),
  layoutInfo: t.procedure.query(() => ({ section: "Server section" })),
  slow: t.procedure.query(async () => {
    await sleep(1000);
    return { text: "slow done", at: new Date(0) };
  }),
  viewer: t.procedure.query(() => ({ name: "KATT" })),
  post: t.router({
    byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      if (opts.input.id === "missing") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return { id: opts.input.id, title: `Post ${opts.input.id}` };
    }),
    comments: t.procedure
      .input(z.object({ postId: z.string(), cursor: z.number().nullish() }))
      .query((opts) => {
        const start = opts.input.cursor ?? 0;
        return { items: [start, start + 1], nextCursor: start + 2 };
      }),
  }),
  counter: t.router({
    get: t.procedure.query(() => counter.value),
    increment: t.procedure.mutation(() => {
      counter.value++;
      return counter.value;
    }),
  }),
  ticks: t.procedure
    .input(z.object({ count: z.number() }))
    .subscription(async function* (opts) {
      for (let tick = 0; tick < opts.input.count; tick++) {
        await sleep(100);
        yield tick;
      }
    }),
});

export type AppRouter = typeof appRouter;
