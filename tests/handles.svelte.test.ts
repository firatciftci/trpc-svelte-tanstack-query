import type { DehydratedState } from "@tanstack/svelte-query";
import {
  createInfiniteQuery,
  createQuery,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
  InfiniteQueryObserver,
  QueryClient,
} from "@tanstack/svelte-query";
import { TRPCClientError } from "@trpc/client";
import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import type { TRPCOptionsProxy } from "#lib/index.js";
import type {
  AnyTRPCHandle,
  inferInfiniteQueryHandle,
  inferQueryHandle,
} from "#lib/unstable-handles/index.js";
import type { HandlesRouter } from "#tests/fixtures/handles/router.js";
import { createTRPCOptionsProxy } from "#lib/index.js";
import {
  ensureEntry,
  fromHandle,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
} from "#lib/unstable-handles/index.js";
import LoadOnHover from "#tests/fixtures/handles/load-on-hover.svelte";
import QueryProbe from "#tests/fixtures/handles/query-probe.svelte";
import {
  createHandlesRouter,
  overTheWire,
} from "#tests/fixtures/handles/router.js";
import { createLocalResource } from "#tests/helpers/local.js";

type TRPC = TRPCOptionsProxy<HandlesRouter>;

function ctx() {
  const { appRouter, calls } = createHandlesRouter();
  const resource = createLocalResource(appRouter, {
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    }),
  });
  return { ...resource, calls, appRouter };
}

type Resource = ReturnType<typeof ctx>;

function makeServerProxy(resource: Resource) {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

describe("loading", () => {
  it("useTRPC() loads handles in an event handler", async () => {
    using resource = ctx();
    const loads: Array<Promise<unknown>> = [];
    const screen = await render(LoadOnHover, {
      setup: () => {
        resource.setTRPCContext({
          trpcClient: resource.client,
          queryClient: resource.queryClient,
        });
        return resource.useTRPC();
      },
      onLoad: (load: Promise<unknown>) => {
        loads.push(load);
      },
    });
    expect(resource.calls).not.toHaveBeenCalled();

    await screen.getByRole("button").hover();
    await vi.waitFor(() => expect(loads).toHaveLength(1));
    expect(await Promise.all(loads)).toEqual([
      [
        {
          post: {
            queryKey: [["post", "byId"], { input: { id: "1" }, type: "query" }],
            input: { id: "1" },
          },
        },
        { post: { id: "1", title: "Post 1" } },
      ],
    ]);
    expect(resource.calls).toHaveBeenCalledTimes(1);
  });
});

describe("runtime", () => {
  it("server load, dehydrate, hydrate, and read without a refetch", async () => {
    using resource = ctx();
    const server = makeServerProxy(resource);

    const [handles] = await loadHandles(server.trpc, {
      handle: prefetchEntry(server.trpc.post.byId, { id: "1" }),
      listHandle: prefetchInfiniteEntry(server.trpc.post.list, { limit: 2 }),
    });
    await vi.waitFor(() => expect(server.queryClient.isFetching()).toBe(0));
    const state = overTheWire(dehydrate(server.queryClient));
    const props = overTheWire(handles);
    expect(resource.calls).toHaveBeenCalledTimes(2);

    hydrate(resource.queryClient, state);
    const trpc = resource.optionsProxy;
    const post = await render(QueryProbe, {
      create: () =>
        createQuery(
          () => fromHandle(trpc, props.handle),
          () => resource.queryClient,
        ),
    });
    const list = await render(QueryProbe, {
      create: () =>
        createInfiniteQuery(
          () =>
            fromHandle(trpc, props.listHandle, {
              getNextPageParam: (last) => last.nextCursor,
            }),
          () => resource.queryClient,
        ),
    });
    await expect
      .element(post.getByText('data:{"id":"1","title":"Post 1"}'))
      .toBeInTheDocument();
    await expect.element(list.getByText(/"items":\[0,1\]/)).toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  it("a server failure is fetched again in the browser, which reports a typed TRPCClientError", async () => {
    using resource = ctx();
    const server = makeServerProxy(resource);
    const [handles] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: "missing" }),
    });
    const handle = overTheWire(handles.post);
    await vi.waitFor(() => expect(server.queryClient.isFetching()).toBe(0));
    hydrate(resource.queryClient, overTheWire(dehydrate(server.queryClient)));

    let query: { readonly error: unknown } | undefined;
    const screen = await render(QueryProbe, {
      create: () =>
        (query = createQuery(
          () => fromHandle(resource.optionsProxy, handle),
          () => resource.queryClient,
        )),
    });
    await expect.element(screen.getByText("status:error")).toBeInTheDocument();
    expect(query?.error).toBeInstanceOf(TRPCClientError);
    expect((query?.error as TRPCClientError<HandlesRouter>).data?.code).toBe(
      "NOT_FOUND",
    );
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  it("a clear() doesn't bring the load's data back to a createQuery reader", async () => {
    using resource = ctx();
    const server = makeServerProxy(resource);
    const [handles] = await loadHandles(server.trpc, {
      post: ensureEntry(server.trpc.post.byId, { id: "1" }),
    });
    const post = overTheWire(handles.post);
    hydrate(resource.queryClient, dehydrate(server.queryClient));

    let renderCount = $state(1);
    let query: { readonly data: unknown } | undefined;
    const screen = await render(QueryProbe, {
      create: () =>
        (query = createQuery(
          () =>
            fromHandle(resource.optionsProxy, post, {
              staleTime: Infinity,
              meta: { renderCount },
            }),
          () => resource.queryClient,
        )),
    });
    await expect
      .element(screen.getByText('data:{"id":"1","title":"Post 1"}'))
      .toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(1);

    resource.queryClient.clear();
    renderCount = 2;
    flushSync();
    expect(query?.data).toBeUndefined();
    await expect
      .element(screen.getByText('data:{"id":"1","title":"Post 1"}'))
      .toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  it("a prefetched handle read with createQuery starts without data", async () => {
    using resource = ctx();
    const server = makeServerProxy(resource);
    const [handles] = await loadHandles(server.trpc, {
      post: prefetchEntry(server.trpc.post.byId, { id: "1" }),
    });
    const post = overTheWire(handles.post);
    const seen: Array<unknown> = [];
    const screen = await render(QueryProbe, {
      create: () => {
        const query = createQuery(
          () => fromHandle(resource.optionsProxy, post),
          () => resource.queryClient,
        );
        seen.push(query.data);
        return query;
      },
    });
    expect(seen[0]).toBeUndefined();
    await expect
      .element(screen.getByText('data:{"id":"1","title":"Post 1"}'))
      .toBeInTheDocument();
  });

  describe("a query dehydrated as pending that rejects later", () => {
    async function setup(failure: "missing" | "flaky" | "flakyList") {
      const resource = ctx();
      const server = makeServerProxy(resource);
      const entries = {
        missing: () => prefetchEntry(server.trpc.post.byId, { id: "missing" }),
        flaky: () => prefetchEntry(server.trpc.flaky, { id: "1" }),
        flakyList: () => prefetchInfiniteEntry(server.trpc.flakyList, {}),
      };
      const [{ handle }] = await loadHandles(server.trpc, {
        handle: entries[failure](),
      });
      const state: DehydratedState = dehydrate(server.queryClient);
      expect(state.queries[0]?.state.status).toBe("pending");
      const browser = resource.queryClient;
      const browserTrpc = resource.optionsProxy;
      return {
        resource,
        handle: handle as AnyTRPCHandle,
        browser,
        browserTrpc,
        hydrateBrowser: () => hydrate(browser, state),
        readQuery: async (
          read: (trpc: TRPC) => {
            readonly status: string;
            readonly data: unknown;
            readonly error: unknown;
          },
        ) => {
          let query:
            | { readonly data: unknown; readonly error: unknown }
            | undefined;
          const screen = await render(QueryProbe, {
            create: () => (query = read(browserTrpc)),
          });
          return { screen, query: () => query };
        },
        [Symbol.dispose]: () => resource[Symbol.dispose](),
      };
    }

    it("is refetched once by a handle read, even with retry: false", async () => {
      using t = await setup("flaky");
      t.hydrateBrowser();
      const { screen } = await t.readQuery((trpc) =>
        createQuery(
          () => fromHandle(trpc, t.handle as inferQueryHandle<TRPC["flaky"]>),
          () => t.browser,
        ),
      );
      await expect
        .element(screen.getByText('data:{"id":"1"}'))
        .toBeInTheDocument();
      expect(t.resource.calls).toHaveBeenCalledTimes(2);
    });

    it("an infinite query is refetched as pages", async () => {
      using t = await setup("flakyList");
      t.hydrateBrowser();
      const options = fromHandle(
        t.browserTrpc,
        t.handle as inferInfiniteQueryHandle<TRPC["flakyList"]>,
        { getNextPageParam: (last) => last.nextCursor },
      );
      await vi.waitFor(() =>
        expect(t.browser.getQueryData(options.queryKey)).toEqual({
          pages: [{ items: [0, 1], nextCursor: 2 }],
          pageParams: [undefined],
        }),
      );
      const observer = new InfiniteQueryObserver(t.browser, options);
      const next = await observer.fetchNextPage();
      expect(next.data?.pages.map((page) => page.items)).toEqual([
        [0, 1],
        [2, 3],
      ]);
    });

    it("reports a typed TRPCClientError instead of a redacted error", async () => {
      using t = await setup("missing");
      t.hydrateBrowser();
      const { screen, query } = await t.readQuery((trpc) =>
        createQuery(
          () =>
            fromHandle(
              trpc,
              t.handle as inferQueryHandle<TRPC["post"]["byId"]>,
            ),
          () => t.browser,
        ),
      );
      await expect
        .element(screen.getByText(/^error:TRPCClientError/))
        .toBeInTheDocument();
      expect(query()?.error).toBeInstanceOf(TRPCClientError);
      expect(
        (query()?.error as TRPCClientError<HandlesRouter>).data?.code,
      ).toBe("NOT_FOUND");
    });

    it("a cancelled query is not refetched", async () => {
      using t = await setup("missing");
      t.hydrateBrowser();
      const options = fromHandle(
        t.browserTrpc,
        t.handle as inferQueryHandle<TRPC["post"]["byId"]>,
      );
      await t.browser.cancelQueries({ queryKey: options.queryKey });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(t.browser.isFetching()).toBe(0);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
    });

    it("a disabled read is not refetched", async () => {
      using t = await setup("flaky");
      t.hydrateBrowser();
      const options = fromHandle(
        t.browserTrpc,
        t.handle as inferQueryHandle<TRPC["flaky"]>,
        { enabled: false },
      );
      await vi.waitFor(() =>
        expect(t.browser.getQueryState(options.queryKey)?.status).toBe("error"),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(t.browser.isFetching()).toBe(0);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
    });

    it("an enabled read after a disabled one is refetched", async () => {
      using t = await setup("flaky");
      t.hydrateBrowser();
      const handle = t.handle as inferQueryHandle<TRPC["flaky"]>;
      fromHandle(t.browserTrpc, handle, { enabled: false });
      const options = fromHandle(t.browserTrpc, handle);
      await vi.waitFor(() =>
        expect(t.browser.getQueryData(options.queryKey)).toEqual({ id: "1" }),
      );
      expect(t.resource.calls).toHaveBeenCalledTimes(2);
    });

    it("a queryOptions(input) read is left alone", async () => {
      using t = await setup("missing");
      t.hydrateBrowser();
      const { screen, query } = await t.readQuery((trpc) =>
        createQuery(
          () => trpc.post.byId.queryOptions({ id: "missing" }),
          () => t.browser,
        ),
      );
      await expect
        .element(screen.getByText("status:error"))
        .toBeInTheDocument();
      expect(query()?.error).not.toBeInstanceOf(TRPCClientError);
      expect(t.resource.calls).toHaveBeenCalledTimes(1);
    });
  });
});
