import { InfiniteQueryObserver, skipToken } from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createServerResource } from "#tests/helpers/server.js";

const fixtureData = ["1", "2", "3", "4"];

function testContext() {
  const t = initTRPC.create({});

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => "__result" as const),
      list: t.procedure
        .input(z.object({ cursor: z.number().default(0) }))
        .query(({ input }) => ({
          items: fixtureData.slice(input.cursor, input.cursor + 1),
          next:
            input.cursor + 1 > fixtureData.length
              ? undefined
              : input.cursor + 1,
        })),
    }),
  });

  return createServerResource(appRouter);
}

describe("infiniteQueryOptions", () => {
  it("basic", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;
    const { queryClient } = ctx;

    const queryOptions = trpc.post.list.infiniteQueryOptions(
      {},
      { getNextPageParam: (lastPage) => lastPage.next },
    );
    expect(queryOptions.trpc.path).toBe("post.list");
    expect(queryOptions.initialPageParam).toBeUndefined();
    expect(queryOptions.queryKey).toEqual(trpc.post.list.infiniteQueryKey({}));

    const observer = new InfiniteQueryObserver(queryClient, queryOptions);
    const unsubscribe = observer.subscribe(() => {});

    await vi.waitFor(() => {
      expect(observer.getCurrentResult().data?.pages).toEqual([
        { items: ["1"], next: 1 },
      ]);
    });
    expect(observer.getCurrentResult().data?.pageParams).toEqual([undefined]);

    queryClient.setQueryData(queryOptions.queryKey, (data) => data);
    expect(
      queryClient.getQueryData(trpc.post.list.infiniteQueryKey({})),
    ).toEqual(observer.getCurrentResult().data);

    await observer.fetchNextPage();
    expect(
      observer.getCurrentResult().data?.pages.map((page) => page.items),
    ).toEqual([["1"], ["2"]]);
    expect(observer.getCurrentResult().data?.pageParams).toEqual([
      undefined,
      1,
    ]);

    const isMatch = vi.fn((query: { state: { data: unknown } }) => {
      expect(query.state.data).toEqual(observer.getCurrentResult().data);
      return true;
    });
    await queryClient.invalidateQueries(
      trpc.post.list.infiniteQueryFilter({}, { predicate: isMatch }),
    );
    expect(isMatch).toHaveBeenCalled();
    expect(
      observer.getCurrentResult().data?.pages.map((page) => page.items),
    ).toEqual([["1"], ["2"]]);

    const fetched = await queryClient.fetchInfiniteQuery(queryOptions);
    expect(fetched.pages.map((page) => page.items)).toEqual([["1"], ["2"]]);
    unsubscribe();
  });

  it("the infinite key does not match plain queries of the procedure", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    expect(trpc.post.list.infiniteQueryKey({})).not.toEqual(
      trpc.post.list.queryKey({}),
    );
    expect(trpc.post.list.infiniteQueryKey({ cursor: 3 })).toEqual(
      trpc.post.list.infiniteQueryKey({}),
    );
  });

  it("skipToken", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    const options = trpc.post.list.infiniteQueryOptions(skipToken, {
      initialData: { pages: [], pageParams: [] },
      getNextPageParam: () => 1,
    });
    expect(options.queryFn).toBe(skipToken);
  });

  it("select", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    const queryOptions = trpc.post.list.infiniteQueryOptions(
      {},
      {
        getNextPageParam: (lastPage) => lastPage.next,
        select: (data) => ({
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            ___selected: true as const,
          })),
        }),
      },
    );
    expect(queryOptions.trpc.path).toBe("post.list");

    const observer = new InfiniteQueryObserver(ctx.queryClient, queryOptions);
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().data?.pages).toEqual([
        { items: ["1"], next: 1, ___selected: true },
      ]);
    });
    await observer.fetchNextPage();
    expect(
      observer.getCurrentResult().data?.pages.map((page) => page.items),
    ).toEqual([["1"], ["2"]]);
    expect(
      ctx.queryClient.getQueryData(queryOptions.queryKey)?.pages[0],
    ).toEqual({ items: ["1"], next: 1 });

    const fetched = await ctx.queryClient.fetchInfiniteQuery(queryOptions);
    expect(fetched.pageParams).toEqual([undefined, 1]);
    unsubscribe();
  });

  it("initialCursor sets the first page param", async () => {
    await using ctx = testContext();
    const trpc = ctx.optionsProxyClient;

    const options = trpc.post.list.infiniteQueryOptions(
      {},
      { initialCursor: 2, getNextPageParam: (lastPage) => lastPage.next },
    );
    expect(options.initialPageParam).toBe(2);
    const data = await ctx.queryClient.fetchInfiniteQuery(options);
    expect(data.pages).toEqual([{ items: ["3"], next: 3 }]);
  });

  it("falsy cursor", async () => {
    const t = initTRPC.create({});
    const appRouter = t.router({
      post: t.router({
        list: t.procedure
          .input(z.object({ cursor: z.number(), foo: z.literal("bar") }))
          .query(({ input }) => ({
            items: fixtureData.slice(input.cursor, input.cursor + 1),
            next:
              input.cursor + 1 > fixtureData.length
                ? undefined
                : input.cursor + 1,
          })),
      }),
    });

    await using ctx = createServerResource(appRouter);
    const trpc = ctx.optionsProxyClient;

    const queryOptions = trpc.post.list.infiniteQueryOptions(
      { cursor: 0, foo: "bar" },
      { getNextPageParam: (lastPage) => lastPage.next },
    );
    expect(queryOptions.trpc.path).toBe("post.list");
    expect(queryOptions.initialPageParam).toBe(0);

    const observer = new InfiniteQueryObserver(ctx.queryClient, queryOptions);
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => {
      expect(
        observer.getCurrentResult().data?.pages.map((page) => page.items),
      ).toEqual([["1"]]);
    });
    await observer.fetchNextPage();
    expect(
      observer.getCurrentResult().data?.pages.map((page) => page.items),
    ).toEqual([["1"], ["2"]]);
    unsubscribe();
  });

  it("calls the router directly on a router proxy", async () => {
    await using ctx = testContext();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const data = await ctx.queryClient.fetchInfiniteQuery({
      ...ctx.optionsProxyServer.post.list.infiniteQueryOptions(
        {},
        { getNextPageParam: (lastPage) => lastPage.next },
      ),
      pages: 2,
    });
    expect(data.pages.map((page) => page.items)).toEqual([["1"], ["2"]]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
