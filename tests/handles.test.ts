import {
  CancelledError,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  QueryClient,
  skipToken,
} from "@tanstack/svelte-query";
import { TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { createTRPCOptionsProxy } from "#lib/index.js";
import {
  ensureEntry,
  ensureInfiniteEntry,
  fetchEntry,
  fetchInfiniteEntry,
  fromHandle,
  isTRPCEntryError,
  loadHandles,
  loadHandlesSettled,
  prefetchEntry,
  prefetchInfiniteEntry,
  TRPCEntryError,
} from "#lib/unstable-handles/index.js";
import {
  createHandlesRouter,
  overTheWire,
} from "#tests/fixtures/handles/router.js";
import { createServerResource } from "#tests/helpers/server.js";

function ctx() {
  const { appRouter, calls } = createHandlesRouter();
  return { ...createServerResource(appRouter), calls, appRouter };
}

type Resource = ReturnType<typeof ctx>;

function makeServerClient() {
  return new QueryClient({
    defaultOptions: {
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

function makeServerProxy(resource: Resource) {
  const queryClient = makeServerClient();
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

describe("loading", () => {
  it("entries start nothing until loaded", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    prefetchEntry(server.trpc.post.byId, { id: "1" });
    fetchEntry(server.trpc.post.byId, { id: "2" });
    ensureInfiniteEntry(server.trpc.post.list, { limit: 2 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resource.calls).not.toHaveBeenCalled();
    expect(server.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("starts every entry before it waits for any, whatever the order", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const promise = loadHandles(server.trpc, {
      post: fetchEntry(server.trpc.post.byId, { id: "1" }),
      list: prefetchInfiniteEntry(server.trpc.post.list, { limit: 2 }),
    });
    expect(server.queryClient.isFetching()).toBe(2);
    const [handles, data] = await promise;
    expect(data).toEqual({ post: { id: "1", title: "Post 1" } });
    expect(handles).toEqual({
      post: {
        queryKey: [["post", "byId"], { input: { id: "1" }, type: "query" }],
        input: { id: "1" },
      },
      list: {
        queryKey: [["post", "list"], { input: { limit: 2 }, type: "infinite" }],
        input: { limit: 2 },
      },
    });
  });

  it("resolves without waiting for prefetch entries", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const [handles, data] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: "1" }),
    });
    expect(data).toEqual({});
    expect(server.queryClient.isFetching()).toBe(1);
    expect(handles.post.input).toEqual({ id: "1" });
  });

  it("rejects when a fetch or ensure entry fails, and prefetch entries never reject", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    await expect(
      loadHandles(server.trpc, {
        post: ensureEntry(server.trpc.post.byId, { id: "missing" }),
        list: fetchEntry(server.trpc.post.list, { limit: 2 }),
      }),
    ).rejects.toBeInstanceOf(TRPCEntryError);
    await expect(
      loadHandles(server.trpc, {
        post: fetchEntry(server.trpc.post.byId, { id: "missing" }),
      }),
    ).rejects.toBeInstanceOf(TRPCEntryError);

    const [handles] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: "missing" }),
    });
    expect(handles.post.input).toEqual({ id: "missing" });
  });

  it("a failed entry says which entry failed, and keeps the TRPCError on the router proxy", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const error = await loadHandles(server.trpc, {
      list: ensureInfiniteEntry(server.trpc.post.list, { limit: 2 }),
      missingPost: ensureEntry(server.trpc.post.byId, { id: "missing" }),
    }).catch((error_: unknown) => error_);

    expect(error).toBeInstanceOf(TRPCEntryError);
    expect(error).toMatchObject({
      key: "missingPost",
      path: "post.byId",
      code: "NOT_FOUND",
    });
    expect(String(error)).toBe(
      'TRPCEntryError: Entry "missingPost" (post.byId) failed: NOT_FOUND',
    );
    expect((error as TRPCEntryError).cause).toBeInstanceOf(TRPCError);
    expect(isTRPCEntryError(error)).toBe(true);
    expect(isTRPCEntryError(error, server.trpc.post.byId)).toBe(true);
    expect(isTRPCEntryError(error, server.trpc.post.list)).toBe(false);
    expect(isTRPCEntryError(new Error("nope"), server.trpc.post.byId)).toBe(
      false,
    );
    expect(isTRPCEntryError(null)).toBe(false);
  });

  it("a failed entry keeps the TRPCClientError on a client proxy", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;

    const error = await loadHandles(trpc, {
      post: fetchEntry(trpc.post.byId, { id: "missing" }),
    }).catch((error_: unknown) => error_);

    expect(error).toMatchObject({
      key: "post",
      path: "post.byId",
      code: "NOT_FOUND",
    });
    expect((error as TRPCEntryError).cause).toBeInstanceOf(TRPCClientError);
    expect(isTRPCEntryError(error, trpc.post.byId)).toBe(true);
  });

  it("a skipToken entry starts nothing and has no handle, data, or result", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const isAdmin = false as boolean;
    const [handles, data] = await loadHandles(server.trpc, {
      post: ensureEntry(server.trpc.post.byId, { id: "1" }),
      draft: isAdmin
        ? ensureEntry(server.trpc.post.draftById, { id: "1" })
        : skipToken,
      never: skipToken,
    });
    expect(resource.calls.mock.calls).toEqual([["post.byId", { id: "1" }]]);
    expect(server.queryClient.getQueryCache().getAll()).toHaveLength(1);
    expect(handles.draft).toBeUndefined();
    expect(handles.never).toBeUndefined();
    expect(Object.keys(handles)).toEqual(["post"]);
    expect(overTheWire(handles)).toStrictEqual(handles);
    expect(data).toEqual({ post: { id: "1", title: "Post 1" } });

    const [settledHandles, results] = await loadHandlesSettled(server.trpc, {
      draft: isAdmin
        ? ensureEntry(server.trpc.post.draftById, { id: "1" })
        : skipToken,
    });
    expect(settledHandles).toEqual({});
    expect(results).toEqual({});
  });

  it("keeps an entry named __proto__ as its own key", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [handles, data] = await loadHandles(trpc, {
      ["__proto__"]: ensureEntry(trpc.post.byId, { id: "1" }),
    });
    expect(Object.keys(handles)).toEqual(["__proto__"]);
    expect(Object.keys(data)).toEqual(["__proto__"]);
  });

  it("javaScript callers get a readable error for a router level loadHandles or fromHandle cannot take", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ handle }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: "1" }),
    });
    expect(() => fromHandle(trpc.viewer as never, handle)).toThrow(
      "`fromHandle(trpc.viewer, handle)` got a handle for `post.byId`, which isn't in `viewer`. Pass the root proxy, `trpc`",
    );
    await expect(loadHandles(trpc.post as never, {})).rejects.toThrow(
      "`loadHandles()` takes the root proxy, `trpc`, got `trpc.post`",
    );
    await expect(loadHandlesSettled(trpc.post as never, {})).rejects.toThrow(
      "`loadHandlesSettled()` takes the root proxy, `trpc`, got `trpc.post`",
    );
  });

  it("loadHandlesSettled waits for every entry, and resolves failures as results", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const [handles, results] = await loadHandlesSettled(server.trpc, {
      missingPost: ensureEntry(server.trpc.post.byId, { id: "missing" }),
      slow: fetchEntry(server.trpc.slow),
      comments: prefetchEntry(server.trpc.post.byId, { id: "missing" }),
    });
    expect(results.slow).toEqual({ status: "success", data: "slow" });
    expect(results.missingPost.status).toBe("error");
    const failed = results.missingPost as Extract<
      typeof results.missingPost,
      { status: "error" }
    >;
    expect(failed.error).toBeInstanceOf(TRPCEntryError);
    expect(failed.error).toMatchObject({
      key: "missingPost",
      path: "post.byId",
      code: "NOT_FOUND",
    });
    expect(Object.keys(results)).toEqual(["missingPost", "slow"]);
    expect(Object.keys(handles)).toEqual(["missingPost", "slow", "comments"]);
    expect(handles.missingPost.input).toEqual({ id: "missing" });
  });

  it("loadHandlesSettled rejects for a cancelled query, as loadHandles does", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    for (const load of [loadHandles, loadHandlesSettled]) {
      const loading = load(server.trpc, {
        slow: ensureEntry(server.trpc.slow),
      });
      await server.queryClient.cancelQueries();
      await expect(loading).rejects.toSatisfy(
        (error: unknown) => error instanceof CancelledError,
      );
    }
  });

  it("javaScript callers get a readable error for a value that is not a proxy", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ handle }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: "1" }),
    });
    expect(() => fromHandle({} as never, handle)).toThrow(
      "`fromHandle()` expects a tRPC options proxy or one of its procedures, got [object Object]",
    );
    expect(() => prefetchEntry(null as never, { id: "1" })).toThrow(
      "`prefetchEntry()` expects a tRPC options proxy or one of its procedures, got null",
    );
  });

  it("rejects with a readable error for a value that is not an entry", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    await expect(
      loadHandles(trpc, { post: { id: "1" } as never }),
    ).rejects.toThrow(
      'Expected an entry from `prefetchEntry()`, `fetchEntry()`, or `ensureEntry()`, or `skipToken`, for "post", got {"id":"1"}',
    );
    expect(resource.calls).not.toHaveBeenCalled();
  });

  it("rejects an entry built with another QueryClient's proxy", async () => {
    await using resource = ctx();
    const a = makeServerProxy(resource);
    const b = makeServerProxy(resource);
    await expect(
      loadHandles(a.trpc, {
        post: prefetchEntry(b.trpc.post.byId, { id: "1" }),
      }),
    ).rejects.toThrow(
      'The entry for "post" was built with a proxy for another QueryClient than the root proxy that loads it',
    );
    expect(resource.calls).not.toHaveBeenCalled();
    expect(a.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("an ensure entry resolves at once with stale data and refetches it from the load", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.byId.queryKey({ id: "1" });
    server.queryClient.setQueryData(queryKey, { id: "1", title: "stale" });

    const [, data] = await loadHandles(server.trpc, {
      post: ensureEntry(server.trpc.post.byId, { id: "1" }),
    });
    expect(data.post.title).toBe("stale");
    await vi.waitFor(() =>
      expect(server.queryClient.getQueryData(queryKey)?.title).toBe("Post 1"),
    );
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  it("an infinite ensure entry refetches stale pages from the load", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.list.infiniteQueryKey({ limit: 2 });
    server.queryClient.setQueryData(queryKey, {
      pages: [{ items: [-1], nextCursor: 2 }],
      pageParams: [null],
    });

    const [, data] = await loadHandles(server.trpc, {
      list: ensureInfiniteEntry(server.trpc.post.list, { limit: 2 }),
    });
    expect(data.list.pages[0]?.items).toEqual([-1]);
    await vi.waitFor(() =>
      expect(
        server.queryClient.getQueryData(queryKey)?.pages[0]?.items,
      ).toEqual([0, 1]),
    );
  });

  it("a fetch entry waits for stale data to refetch", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const queryKey = server.trpc.post.byId.queryKey({ id: "1" });
    server.queryClient.setQueryData(queryKey, { id: "1", title: "stale" });

    const [, data] = await loadHandles(server.trpc, {
      post: fetchEntry(server.trpc.post.byId, { id: "1" }),
    });
    expect(data.post.title).toBe("Post 1");
    expect(resource.calls).toHaveBeenCalledTimes(1);

    const [, fresh] = await loadHandles(server.trpc, {
      post: fetchEntry(
        server.trpc.post.byId,
        { id: "1" },
        { staleTime: Infinity },
      ),
    });
    expect(fresh.post.title).toBe("Post 1");
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  it("infinite entries can load several pages up front", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const getNextPageParam = (last: { nextCursor: number }) => last.nextCursor;
    const [handles, data] = await loadHandles(trpc, {
      ensured: ensureInfiniteEntry(
        trpc.post.list,
        { limit: 2 },
        { pages: 2, getNextPageParam },
      ),
      fetched: fetchInfiniteEntry(
        trpc.post.list,
        { limit: 3, cursor: 10 },
        { pages: 2, getNextPageParam },
      ),
    });
    expect(data.ensured.pages.flatMap((page) => page.items)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(data.fetched.pages.flatMap((page) => page.items)).toEqual([
      10, 11, 12, 13,
    ]);
    expect(handles.fetched).toEqual({
      queryKey: [["post", "list"], { input: { limit: 3 }, type: "infinite" }],
      input: { limit: 3 },
      initialCursor: 10,
    });
    expect(
      resource.queryClient
        .getQueryData(
          fromHandle(trpc, handles.ensured, { getNextPageParam }).queryKey,
        )
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
  });

  it("infinite fetch entries refetch every cached page with getNextPageParam", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const getNextPageParam = (last: { nextCursor: number }) => last.nextCursor;
    await loadHandles(trpc, {
      list: fetchInfiniteEntry(
        trpc.post.list,
        { limit: 2 },
        { pages: 2, getNextPageParam },
      ),
    });
    resource.calls.mockClear();

    await loadHandles(trpc, {
      list: fetchInfiniteEntry(
        trpc.post.list,
        { limit: 2 },
        { getNextPageParam },
      ),
    });
    expect(
      resource.queryClient
        .getQueryData(trpc.post.list.infiniteQueryKey({ limit: 2 }))
        ?.pages.flatMap((page) => page.items),
    ).toEqual([0, 1, 2, 3]);
    expect(
      resource.calls.mock.calls.map(([, input]) => input.cursor ?? null),
    ).toEqual([null, 2]);
  });

  it("javaScript callers get a readable error for a procedure or a handle in place of the root proxy", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    await expect(loadHandles(trpc.post.byId as never, {})).rejects.toThrow(
      "`loadHandles()` takes the root proxy, `trpc`, got `trpc.post.byId`",
    );
    const [{ handle }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: "1" }),
    });
    await expect(loadHandles(handle as never, {})).rejects.toThrow(
      "`loadHandles()` expects a tRPC options proxy or one of its procedures, got a handle for `post.byId`",
    );
  });
});

describe("runtime", () => {
  it("handle reads share cache entries with queryOptions(input)", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyClient;
    const [{ handle, list }] = await loadHandles(trpc, {
      handle: prefetchEntry(trpc.post.byId, { id: "1" }),
      list: prefetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    expect(fromHandle(trpc, handle).queryKey).toEqual(
      trpc.post.byId.queryOptions({ id: "1" }).queryKey,
    );
    expect(
      fromHandle(trpc, list, { getNextPageParam: (last) => last.nextCursor })
        .queryKey,
    ).toEqual(
      trpc.post.list.infiniteQueryOptions(
        { limit: 2 },
        { getNextPageParam: (last) => last.nextCursor },
      ).queryKey,
    );
  });

  it("a mismatched keyPrefix is a loud error, not a silent cache miss", async () => {
    await using resource = ctx();
    const serverTrpc = createTRPCOptionsProxy<
      typeof resource.appRouter,
      { keyPrefix: true }
    >({
      router: resource.appRouter,
      ctx: {},
      queryClient: makeServerClient(),
      keyPrefix: "server",
    });
    const [{ handle }] = await loadHandles(serverTrpc, {
      handle: prefetchEntry(serverTrpc.post.byId, { id: "1" }),
    });
    expect(() =>
      fromHandle(resource.optionsProxyClient, handle as never),
    ).toThrow(
      'The handle for "post.byId" was created with keyPrefix "server", but this proxy uses undefined',
    );
  });

  it("round trip with the same keyPrefix on both sides", async () => {
    await using resource = ctx();
    const serverQueryClient = makeServerClient();
    const serverTrpc = createTRPCOptionsProxy<
      typeof resource.appRouter,
      { keyPrefix: true }
    >({
      router: resource.appRouter,
      ctx: {},
      queryClient: serverQueryClient,
      keyPrefix: "app",
    });
    const [handles] = await loadHandles(serverTrpc, {
      post: prefetchEntry(serverTrpc.post.byId, { id: "1" }),
    });
    const handle = overTheWire(handles.post);
    await vi.waitFor(() => expect(serverQueryClient.isFetching()).toBe(0));
    hydrate(resource.queryClient, overTheWire(dehydrate(serverQueryClient)));

    const browserTrpc = createTRPCOptionsProxy<
      typeof resource.appRouter,
      { keyPrefix: true }
    >({
      client: resource.client,
      queryClient: resource.queryClient,
      keyPrefix: "app",
    });
    const data = await resource.queryClient.ensureQueryData(
      fromHandle(browserTrpc, handle),
    );
    expect(data).toEqual({ id: "1", title: "Post 1" });
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });

  it("handles carry their input", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);
    const [{ post, list }] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: "1" }),
      list: prefetchInfiniteEntry(server.trpc.post.list, {
        limit: 2,
        cursor: 4,
      }),
    });
    expect(post.input).toEqual({ id: "1" });
    expect(list.input).toEqual({ limit: 2 });
    expect(list.initialCursor).toBe(4);

    const props = overTheWire({ post, list });
    expect(props.post.input).toEqual({ id: "1" });
    expect(props.list.input).toEqual({ limit: 2 });
  });

  it("procedures without input", async () => {
    await using resource = ctx();
    const trpc = resource.optionsProxyServer;
    const [{ viewer }, data] = await loadHandles(trpc, {
      viewer: ensureEntry(trpc.viewer),
    });
    expect(viewer).toEqual({ queryKey: [["viewer"], { type: "query" }] });
    expect(data.viewer).toEqual({ name: "KATT" });
    await expect(
      resource.queryClient.fetchQuery(fromHandle(trpc, viewer)),
    ).resolves.toEqual({ name: "KATT" });
  });

  it("handles of procedures without input have no input key", async () => {
    await using resource = ctx();
    const server = resource.optionsProxyServer;
    const client = resource.optionsProxyClient;
    const [handles] = await loadHandles(server, {
      prefetch: prefetchEntry(server.viewer),
      ensure: ensureEntry(server.viewer),
      fetch: fetchEntry(server.viewer),
      explicitUndefined: prefetchEntry(server.viewer, undefined),
      prefetchInfinite: prefetchInfiniteEntry(server.viewer, undefined),
      ensureInfinite: ensureInfiniteEntry(server.viewer, undefined),
      withInput: ensureEntry(server.post.byId, { id: "1" }),
    });

    for (const [key, handle] of Object.entries(handles)) {
      if (key !== "withInput") {
        expect(Object.keys(handle)).toEqual(["queryKey"]);
      }
    }
    expect(handles.withInput.input).toEqual({ id: "1" });
    expect(overTheWire(handles)).toStrictEqual(handles);

    const read = overTheWire(handles);
    expect(fromHandle(client, read.ensure).queryKey).toEqual(
      client.viewer.queryOptions().queryKey,
    );
    expect(fromHandle(client, read.withInput).queryKey).toEqual(
      client.post.byId.queryOptions({ id: "1" }).queryKey,
    );
  });

  it("fetch and ensure entries resolve once the cache has the data, with only the key and input", async () => {
    await using resource = ctx();
    const server = makeServerProxy(resource);

    const [{ ensured, fetched, list, fetchedList }] = await loadHandles(
      server.trpc,
      {
        ensured: ensureEntry(server.trpc.post.byId, { id: "1" }),
        fetched: fetchEntry(server.trpc.post.byId, { id: "2" }),
        list: ensureInfiniteEntry(
          server.trpc.post.list,
          { limit: 2 },
          { pages: 2, getNextPageParam: (last) => last.nextCursor },
        ),
        fetchedList: fetchInfiniteEntry(server.trpc.post.list, {
          limit: 3,
          cursor: 10,
        }),
      },
    );
    expect(ensured).toEqual({
      queryKey: [["post", "byId"], { input: { id: "1" }, type: "query" }],
      input: { id: "1" },
    });
    expect(overTheWire(ensured)).toEqual(ensured);
    expect(
      server.queryClient.getQueryData(
        server.trpc.post.byId.queryKey({ id: "1" }),
      ),
    ).toEqual({ id: "1", title: "Post 1" });
    expect(fetched).toEqual({
      queryKey: [["post", "byId"], { input: { id: "2" }, type: "query" }],
      input: { id: "2" },
    });
    expect(list).toEqual({
      queryKey: [["post", "list"], { input: { limit: 2 }, type: "infinite" }],
      input: { limit: 2 },
    });
    expect(
      server.queryClient.getQueryData(
        server.trpc.post.list.infiniteQueryKey({ limit: 2 }),
      )?.pages,
    ).toHaveLength(2);
    expect(fetchedList).toEqual({
      queryKey: [["post", "list"], { input: { limit: 3 }, type: "infinite" }],
      input: { limit: 3 },
      initialCursor: 10,
    });
  });

  it("tests can build a handle from fixture data without calling the procedure", async () => {
    await using resource = ctx();
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({
      router: resource.appRouter,
      ctx: {},
      queryClient,
    });
    queryClient.setQueryData(trpc.post.byId.queryKey({ id: "1" }), {
      id: "1",
      title: "Fixture",
    });
    const [{ post }] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id: "1" }, { staleTime: Infinity }),
    });
    expect(queryClient.getQueryData(fromHandle(trpc, post).queryKey)).toEqual({
      id: "1",
      title: "Fixture",
    });
    expect(resource.calls).not.toHaveBeenCalled();
  });
});
