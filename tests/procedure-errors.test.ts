import { MutationObserver, QueryObserver } from "@tanstack/svelte-query";
import { initTRPC, TRPCError } from "@trpc/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createServerResource } from "#tests/helpers/server.js";

class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Too many requests");
    this.retryAfterMs = retryAfterMs;
  }
}

function testContext() {
  const t = initTRPC.create({
    errorFormatter: (opts) => ({
      ...opts.shape,
      data: { ...opts.shape.data, fromGlobalFormatter: true as const },
    }),
  });

  const rateLimited = t.procedure.errors((opts) => {
    if (opts.error.cause instanceof RateLimitError) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          kind: "RATE_LIMIT" as const,
          retryAfterMs: opts.error.cause.retryAfterMs,
        },
      };
    }
  });

  const appRouter = t.router({
    plain: t.procedure.query((): string => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }),
    limitedQuery: rateLimited.query((): string => {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        cause: new RateLimitError(1234),
      });
    }),
    limitedMutation: rateLimited.mutation((): string => {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        cause: new RateLimitError(5678),
      });
    }),
  });

  return createServerResource(appRouter);
}

describe("procedure-level .errors()", () => {
  it("queryOptions surfaces the procedure error union", async () => {
    await using ctx = testContext();
    const observer = new QueryObserver(ctx.queryClient, {
      ...ctx.optionsProxyClient.limitedQuery.queryOptions(),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => {
      expect(observer.getCurrentResult().error).not.toBeNull();
    });
    const data = observer.getCurrentResult().error?.data;
    if (data == null || !("kind" in data)) {
      throw new Error("expected the procedure error shape");
    }
    expectTypeOf(data.kind).toEqualTypeOf<"RATE_LIMIT">();
    expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
    expect(`${data.kind}:${data.retryAfterMs}`).toBe("RATE_LIMIT:1234");
    unsubscribe();
  });

  it("mutationOptions surfaces the procedure error union", async () => {
    await using ctx = testContext();
    const observer = new MutationObserver(
      ctx.queryClient,
      ctx.optionsProxyClient.limitedMutation.mutationOptions(),
    );

    await observer.mutate().catch(() => null);
    const data = observer.getCurrentResult().error?.data;
    if (data == null || !("kind" in data)) {
      throw new Error("expected the procedure error shape");
    }
    expectTypeOf(data.kind).toEqualTypeOf<"RATE_LIMIT">();
    expect(`${data.kind}:${data.retryAfterMs}`).toBe("RATE_LIMIT:5678");
  });

  it("procedures without their own formatter keep the router error shape", async () => {
    await using ctx = testContext();
    const observer = new QueryObserver(ctx.queryClient, {
      ...ctx.optionsProxyClient.plain.queryOptions(),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => {
      expect(observer.getCurrentResult().error).not.toBeNull();
    });
    const data = observer.getCurrentResult().error?.data;
    // @ts-expect-error `kind` is only on procedures with their own formatter
    void data?.kind;
    expect(data?.fromGlobalFormatter).toBe(true);
    unsubscribe();
  });
});
