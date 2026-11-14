import {
  defaultShouldDehydrateQuery,
  dehydrate,
  QueryClient,
} from "@tanstack/svelte-query";
import superjson from "superjson";
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import { createTRPCOptionsProxy } from "#lib/index.js";
import {
  ensureEntry,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
} from "#lib/unstable-handles/index.js";
import SsrApp from "#tests/fixtures/handles/ssr-app.svelte";
import { createSsrRouter } from "#tests/fixtures/handles/ssr-router.js";
import { createServerResource } from "#tests/helpers/server.js";

function ctx() {
  const { appRouter, calls } = createSsrRouter();
  return { ...createServerResource(appRouter), calls, appRouter };
}

type Resource = ReturnType<typeof ctx>;

function makeServer(resource: Resource) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      dehydrate: {
        serializeData: superjson.serialize,
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

function makeBrowserQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}

function trpcWarnings(warn: { mock: { calls: Array<Array<unknown>> } }) {
  return warn.mock.calls
    .map(([message]) => String(message))
    .filter((message) => message.startsWith("[trpc-svelte-tanstack-query]"));
}

describe("server rendering", () => {
  it("renders ensured handles from the dehydrated state, and pending ones resolve without fetching again", async () => {
    await using resource = ctx();
    using warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = makeServer(resource);

    const [{ ensured, pending, list }] = await loadHandles(server.trpc, {
      ensured: ensureEntry(server.trpc.post.byDay, {
        day: new Date("2026-01-01"),
      }),
      pending: prefetchEntry(server.trpc.post.byDay, {
        day: new Date("2026-01-02"),
        slow: true,
      }),
      list: prefetchInfiniteEntry(server.trpc.post.list, {}),
    });
    const state = dehydrate(server.queryClient);
    expect(
      state.queries.map((query) => query.state.status).slice(0, 2),
    ).toEqual(["success", "pending"]);

    const props = structuredClone({ ensured, pending, list });
    const queryClient = makeBrowserQueryClient();
    const renderApp = () =>
      render(SsrApp, {
        props: {
          trpcClient: resource.client,
          queryClient,
          state,
          posts: [props.ensured, props.pending],
          list: props.list,
        },
      }).body;

    const html = renderApp();
    expect(html).toContain(
      "Posts on 2026-01-01 v1 fetchedAt:1970-01-01T00:00:00.000Z",
    );

    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
    const settled = renderApp();
    expect(settled).toContain("Posts on 2026-01-02");
    expect(settled).toContain("items:0,1");
    expect(resource.calls).toHaveBeenCalledTimes(3);
    expect(trpcWarnings(warn)).toEqual([]);
  });

  it("warns once when a handle is read during server rendering without hydration", async () => {
    await using resource = ctx();
    using warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = makeServer(resource);
    const [{ handle }] = await loadHandles(server.trpc, {
      handle: prefetchEntry(server.trpc.post.byDay, {
        day: new Date("2026-02-01"),
      }),
    });
    await vi.waitFor(() => expect(resource.calls).toHaveBeenCalledTimes(1));

    const renderApp = () =>
      render(SsrApp, {
        props: {
          trpcClient: resource.client,
          queryClient: makeBrowserQueryClient(),
          state: undefined,
          posts: [handle],
        },
      }).body;
    expect(renderApp()).toContain("loading");
    expect(renderApp()).toContain("loading");

    await vi.waitFor(() => expect(resource.calls).toHaveBeenCalledTimes(3));
    expect(trpcWarnings(warn)).toHaveLength(1);
    expect(trpcWarnings(warn)[0]).toContain(
      'The handle for "post.byDay" is being fetched again during server rendering',
    );
  });

  it("a handle from an ensure entry needs hydration too", async () => {
    await using resource = ctx();
    using warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = makeServer(resource);
    const [{ handle }] = await loadHandles(server.trpc, {
      handle: ensureEntry(server.trpc.post.byDay, {
        day: new Date("2026-02-02"),
      }),
    });

    const html = render(SsrApp, {
      props: {
        trpcClient: resource.client,
        queryClient: makeBrowserQueryClient(),
        state: undefined,
        posts: [handle],
      },
    }).body;
    expect(html).toContain("loading");
    await vi.waitFor(() => expect(resource.calls).toHaveBeenCalledTimes(2));
    expect(trpcWarnings(warn)).toHaveLength(1);
  });

  it("renders the cached data the same QueryClient already has, with no warning", async () => {
    await using resource = ctx();
    using warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const queryClient = makeBrowserQueryClient();
    const trpc = createTRPCOptionsProxy({
      client: resource.client,
      queryClient,
    });
    const [{ handle }] = await loadHandles(trpc, {
      handle: ensureEntry(trpc.post.byDay, { day: new Date("2026-03-01") }),
    });
    const html = render(SsrApp, {
      props: {
        trpcClient: resource.client,
        queryClient,
        state: undefined,
        posts: [handle],
      },
    }).body;
    expect(html).toContain(
      "Posts on 2026-03-01 v1 fetchedAt:1970-01-01T00:00:00.000Z",
    );
    expect(resource.calls).toHaveBeenCalledTimes(1);
    expect(trpcWarnings(warn)).toEqual([]);
  });
});
