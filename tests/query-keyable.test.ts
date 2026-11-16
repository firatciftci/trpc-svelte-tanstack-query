import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTRPCKeys } from "#lib/index.js";
import { createServerResource } from "#tests/helpers/server.js";

function testContext(opts?: { keyPrefix?: string }) {
  const t = initTRPC.create({
    errorFormatter(formatter) {
      return { foo: 1, ...formatter.shape };
    },
  });

  const appRouter = t.router({
    bluesky: {
      post: t.router({
        byId: t.procedure
          .input(z.object({ id: z.string() }))
          .query(() => "__result" as const),
        create: t.procedure.mutation(() => "__mutationResult" as const),
      }),
    },
  });

  return createServerResource(appRouter, opts);
}

describe("get queryFilter", () => {
  it("gets various query filters", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    expect(trpc.pathFilter()).toEqual({ queryKey: [] });
    expect(trpc.bluesky.pathFilter()).toEqual({ queryKey: [["bluesky"]] });
    expect(trpc.bluesky.post.pathFilter()).toEqual({
      queryKey: [["bluesky", "post"]],
    });
    expect(trpc.bluesky.post.byId.pathFilter()).toEqual({
      queryKey: [["bluesky", "post", "byId"]],
    });
    expect(trpc.bluesky.post.byId.queryFilter({ id: "1" })).toEqual({
      queryKey: [
        ["bluesky", "post", "byId"],
        { input: { id: "1" }, type: "query" },
      ],
    });
  });

  it("keeps the extra filters", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;
    const isMatch = () => true;

    expect(trpc.bluesky.pathFilter({ stale: true })).toEqual({
      stale: true,
      queryKey: [["bluesky"]],
    });
    expect(
      trpc.bluesky.post.byId.queryFilter({ id: "1" }, { predicate: isMatch }),
    ).toEqual({
      predicate: isMatch,
      queryKey: [
        ["bluesky", "post", "byId"],
        { input: { id: "1" }, type: "query" },
      ],
    });
  });

  it("filters match the queries they describe", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;
    const { queryClient } = ctx;

    queryClient.setQueryData(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
      "__result",
    );
    queryClient.setQueryData(
      trpc.bluesky.post.byId.queryKey({ id: "2" }),
      "__result",
    );

    const queryCache = queryClient.getQueryCache();
    expect(queryCache.findAll(trpc.pathFilter())).toHaveLength(2);
    expect(queryCache.findAll(trpc.bluesky.pathFilter())).toHaveLength(2);
    expect(
      queryCache.findAll(trpc.bluesky.post.byId.pathFilter()),
    ).toHaveLength(2);
    expect(
      queryCache.findAll(trpc.bluesky.post.byId.queryFilter({ id: "1" })),
    ).toHaveLength(1);
    expect(
      queryCache.findAll(trpc.bluesky.post.byId.queryFilter()),
    ).toHaveLength(2);
  });
});

describe("get queryKey", () => {
  it("gets various query keys", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    ctx.queryClient.setQueryData(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
      "__result",
    );
    expect(
      ctx.queryClient.getQueryData(
        trpc.bluesky.post.byId.queryKey({ id: "1" }),
      ),
    ).toBe("__result");

    expect(trpc.pathKey()).toEqual([]);
    expect(trpc.bluesky.pathKey()).toEqual([["bluesky"]]);
    expect(trpc.bluesky.post.pathKey()).toEqual([["bluesky", "post"]]);
    expect(trpc.bluesky.post.byId.pathKey()).toEqual([
      ["bluesky", "post", "byId"],
    ]);
    expect(trpc.bluesky.post.byId.queryKey({ id: "1" })).toEqual([
      ["bluesky", "post", "byId"],
      { input: { id: "1" }, type: "query" },
    ]);
  });
});

describe("get queryKey with a prefix", () => {
  it("gets various query keys", async () => {
    await using ctx = testContext({ keyPrefix: "user-123" });
    const trpc = ctx.optionsProxyClient;

    ctx.queryClient.setQueryData(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
      "__result",
    );

    expect(trpc.pathKey()).toEqual([["user-123"]]);
    expect(trpc.bluesky.pathKey()).toEqual([["user-123"], ["bluesky"]]);
    expect(trpc.bluesky.post.pathKey()).toEqual([
      ["user-123"],
      ["bluesky", "post"],
    ]);
    expect(trpc.bluesky.post.byId.pathKey()).toEqual([
      ["user-123"],
      ["bluesky", "post", "byId"],
    ]);
    expect(trpc.bluesky.post.byId.queryKey({ id: "1" })).toEqual([
      ["user-123"],
      ["bluesky", "post", "byId"],
      { input: { id: "1" }, type: "query" },
    ]);
  });

  it("the server proxy builds the same keys", async () => {
    await using ctx = testContext({ keyPrefix: "user-123" });

    expect(
      ctx.optionsProxyServer.bluesky.post.byId.queryKey({ id: "1" }),
    ).toEqual(ctx.optionsProxyClient.bluesky.post.byId.queryKey({ id: "1" }));
    expect(ctx.optionsProxyServer.bluesky.post.create.mutationKey()).toEqual(
      ctx.optionsProxyClient.bluesky.post.create.mutationKey(),
    );
  });
});

describe("get mutationKey", () => {
  it("gets various mutation keys", async () => {
    await using ctx = testContext();
    expect(ctx.optionsProxyClient.bluesky.post.create.mutationKey()).toEqual([
      ["bluesky", "post", "create"],
    ]);
  });
});

describe("get mutationKey with prefix", () => {
  it("gets various mutation keys", async () => {
    await using ctx = testContext({ keyPrefix: "user-123" });
    expect(ctx.optionsProxyClient.bluesky.post.create.mutationKey()).toEqual([
      ["user-123"],
      ["bluesky", "post", "create"],
    ]);
  });

  it("a mutation's own keyPrefix wins", async () => {
    await using ctx = testContext({ keyPrefix: "user-123" });
    expect(
      ctx.optionsProxyClient.bluesky.post.create.mutationOptions({
        keyPrefix: "other",
      }).mutationKey,
    ).toEqual([["other"], ["bluesky", "post", "create"]]);
  });
});

it("keys of a prefixed and an unprefixed proxy", async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    q: t.procedure.query(() => "query"),
    m: t.procedure.mutation(() => "mutation"),
  });

  {
    const prefix = "user-123";
    await using ctx = createServerResource(appRouter, { keyPrefix: prefix });
    expect(ctx.optionsProxyClient.q.pathKey()).toEqual([[prefix], ["q"]]);
    expect(ctx.optionsProxyClient.m.mutationKey()).toEqual([[prefix], ["m"]]);
  }
  {
    await using ctx = createServerResource(appRouter);
    expect(ctx.optionsProxyClient.q.pathKey()).toEqual([["q"]]);
    expect(ctx.optionsProxyClient.m.mutationKey()).toEqual([["m"]]);
  }
});

describe("createTRPCKeys", () => {
  it("builds the same keys and filters as the options proxy", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;
    const keys = createTRPCKeys<typeof ctx.router>();
    const isMatch = () => true;

    expect(keys.pathKey()).toEqual(trpc.pathKey());
    expect(keys.bluesky.pathFilter({ stale: true })).toEqual(
      trpc.bluesky.pathFilter({ stale: true }),
    );
    expect(keys.bluesky.post.byId.queryKey({ id: "1" })).toEqual(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
    );
    expect(
      keys.bluesky.post.byId.queryFilter({ id: "1" }, { predicate: isMatch }),
    ).toEqual(
      trpc.bluesky.post.byId.queryFilter({ id: "1" }, { predicate: isMatch }),
    );
    expect(keys.bluesky.post.create.mutationKey()).toEqual(
      trpc.bluesky.post.create.mutationKey(),
    );
  });

  it("builds prefixed keys", async () => {
    await using ctx = testContext({ keyPrefix: "user-123" });
    const trpc = ctx.optionsProxyClient;
    const keys = createTRPCKeys<typeof ctx.router, { keyPrefix: true }>({
      keyPrefix: "user-123",
    });

    expect(keys.bluesky.post.byId.queryKey({ id: "1" })).toEqual(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
    );
    expect(keys.bluesky.post.create.mutationKey()).toEqual([
      ["user-123"],
      ["bluesky", "post", "create"],
    ]);
  });
});
