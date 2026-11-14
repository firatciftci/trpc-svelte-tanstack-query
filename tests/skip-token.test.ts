import { QueryObserver, skipToken } from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createServerResource } from "#tests/helpers/server.js";

function testContext() {
  const t = initTRPC.create({});

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => "__result" as const),
      list: t.procedure
        .input(z.object({ cursor: z.string() }))
        .query(() => ["__result"] as const),
    }),
    events: t.procedure.input(z.number()).subscription(async function* () {
      yield 0;
    }),
  });

  return createServerResource(appRouter);
}

describe("skipToken", () => {
  it("various methods honor the skipToken", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    const options = trpc.post.byId.queryOptions(skipToken);
    expect(options.queryFn).toBe(skipToken);
    expect(options.queryKey).toEqual([["post", "byId"], { type: "query" }]);

    const options2 = trpc.post.list.infiniteQueryOptions(skipToken, {
      getNextPageParam() {
        return "next";
      },
    });
    expect(options2.queryFn).toBe(skipToken);
    expect(options2.queryKey).toEqual([["post", "list"], { type: "infinite" }]);
  });

  it("a skipped query never fetches", async () => {
    await using ctx = testContext();
    const options = ctx.optionsProxyClient.post.byId.queryOptions(skipToken);

    const observer = new QueryObserver(ctx.queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(observer.getCurrentResult()).toMatchObject({
      status: "pending",
      fetchStatus: "idle",
    });
    expect(ctx.linkSpy.up).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("subscriptionOptions(skipToken).enabled is false; normal input is enabled", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    const skipped = trpc.events.subscriptionOptions(skipToken, {});
    expect(skipped.enabled).toBe(false);

    const active = trpc.events.subscriptionOptions(42, {});
    expect(active.enabled).toBe(true);

    const forcedOff = trpc.events.subscriptionOptions(42, { enabled: false });
    expect(forcedOff.enabled).toBe(false);
  });

  it("a skipped subscription subscribes with undefined input", async () => {
    await using ctx = testContext();
    const options = ctx.optionsProxyClient.events.subscriptionOptions(
      skipToken,
      { enabled: true },
    );

    const subscription = options.subscribe({});
    subscription.unsubscribe();
    expect(ctx.linkSpy.up.mock.calls[0]?.[0]).toMatchObject({
      type: "subscription",
      path: "events",
      input: undefined,
    });
  });
});
