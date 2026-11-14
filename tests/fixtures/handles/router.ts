import { initTRPC, TRPCError } from "@trpc/server";
import { vi } from "vitest";
import { z } from "zod";

export function createHandlesRouter() {
  const t = initTRPC.create({ allowOutsideOfServer: true });
  const calls =
    vi.fn<
      (
        path: string,
        input: { cursor?: number | null } & Record<string, unknown>,
      ) => void
    >();
  const countCalls = (path: string) =>
    calls.mock.calls.filter(([calledPath]) => calledPath === path).length;
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
        calls("post.byId", opts.input);
        if (opts.input.id === "missing") {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return { id: opts.input.id, title: `Post ${opts.input.id}` };
      }),
      draftById: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({
          id: opts.input.id,
          title: `Draft ${opts.input.id}`,
        })),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish(), limit: z.number() }))
        .query((opts) => {
          calls("post.list", opts.input);
          const start = opts.input.cursor ?? 0;
          return { items: [start, start + 1], nextCursor: start + 2 };
        }),
    }),
    viewer: t.procedure.query(() => ({ name: "KATT" })),
    slow: t.procedure.query(
      async () =>
        new Promise<string>((resolve) => setTimeout(resolve, 50, "slow")),
    ),
    flaky: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      calls("flaky", opts.input);
      if (countCalls("flaky") === 1) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return { id: opts.input.id };
    }),
    flakyList: t.procedure
      .input(z.object({ cursor: z.number().nullish() }))
      .query((opts) => {
        calls("flakyList", opts.input);
        if (countCalls("flakyList") === 1) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        const start = opts.input.cursor ?? 0;
        return { items: [start, start + 1], nextCursor: start + 2 };
      }),
  });
  return { appRouter, calls };
}

export type HandlesRouter = ReturnType<typeof createHandlesRouter>["appRouter"];

export function overTheWire<T>(value: T): T {
  const json = JSON.stringify(value);
  return JSON.parse(json) as T;
}
