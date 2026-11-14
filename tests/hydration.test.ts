import type { DehydratedState } from "@tanstack/svelte-query";
import {
  defaultShouldDehydrateQuery,
  hydrate,
  MutationObserver,
  QueryClient,
} from "@tanstack/svelte-query";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTRPCOptionsProxy, dehydrateUnsent } from "#lib/index.js";
import { createServerResource } from "#tests/helpers/server.js";

function createResource() {
  const t = initTRPC.create({ transformer: superjson });
  const calls = vi.fn();
  let version = 0;
  const appRouter = t.router({
    post: t.router({
      byDay: t.procedure.input(z.object({ day: z.date() })).query((opts) => {
        calls(opts.input);
        version++;
        return {
          title: `Posts on ${opts.input.day.toISOString().slice(0, 10)}`,
          version,
          fetchedAt: new Date(0),
        };
      }),
      missing: t.procedure.query(() => {
        throw new TRPCError({ code: "NOT_FOUND" });
      }),
      like: t.procedure
        .input(z.object({ id: z.number() }))
        .mutation((opts) => opts.input.id),
    }),
  });
  return {
    ...createServerResource(appRouter, {
      queryClient: makeBrowserQueryClient(),
    }),
    calls,
    appRouter,
  };
}

type Resource = ReturnType<typeof createResource>;

function makeServerQueryClient() {
  return new QueryClient({
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
}

function makeBrowserQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}

function makeServer(resource: Resource) {
  const queryClient = makeServerQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

function hashes(state: DehydratedState) {
  return state.queries.map((query) => query.queryHash);
}

describe("dehydrateUnsent", () => {
  it("nested loads send each query once", async () => {
    await using resource = createResource();
    const server = makeServer(resource);

    const a = server.trpc.post.byDay.queryKey({ day: new Date("2026-01-01") });
    void server.queryClient.prefetchQuery(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    const outer = dehydrateUnsent(server.queryClient);
    expect(outer.queries).toHaveLength(1);
    expect(outer.queries[0]?.state.status).toBe("pending");

    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-02") }),
    );
    const inner = dehydrateUnsent(server.queryClient);
    expect(inner.queries).toHaveLength(1);
    expect(inner.queries[0]?.queryKey).toEqual(
      server.trpc.post.byDay.queryKey({ day: new Date("2026-01-02") }),
    );

    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    expect(server.queryClient.getQueryState(a)?.status).toBe("success");
    expect(dehydrateUnsent(server.queryClient).queries).toEqual([]);
  });

  it("sends a query again when the server has newer data for it", async () => {
    await using resource = createResource();
    const server = makeServer(resource);
    const opts = server.trpc.post.byDay.queryOptions({
      day: new Date("2026-01-01"),
    });

    await server.queryClient.ensureQueryData(opts);
    expect(hashes(dehydrateUnsent(server.queryClient))).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 2));
    await server.queryClient.fetchQuery({ ...opts, staleTime: 0 });
    const resent = dehydrateUnsent(server.queryClient);
    expect(resent.queries).toHaveLength(1);
    expect(
      superjson.deserialize(resent.queries[0]?.state.data as never),
    ).toMatchObject({ version: 2 });
  });

  it("keeps the client's dehydrate filter, and doesn't mark filtered queries as sent", async () => {
    await using resource = createResource();
    const server = makeServer(resource);
    server.queryClient.setDefaultOptions({
      ...server.queryClient.getDefaultOptions(),
      dehydrate: {
        ...server.queryClient.getDefaultOptions().dehydrate,
        shouldDehydrateQuery: defaultShouldDehydrateQuery,
      },
    });

    void server.queryClient.prefetchQuery(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    expect(dehydrateUnsent(server.queryClient).queries).toEqual([]);

    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    expect(dehydrateUnsent(server.queryClient).queries).toHaveLength(1);
  });

  it("each request client starts over", async () => {
    await using resource = createResource();
    const first = makeServer(resource);
    const second = makeServer(resource);
    await first.queryClient.ensureQueryData(
      first.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    await second.queryClient.ensureQueryData(
      second.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );

    expect(dehydrateUnsent(first.queryClient).queries).toHaveLength(1);
    expect(dehydrateUnsent(second.queryClient).queries).toHaveLength(1);
  });

  it("a query whose pending send settles with newer data is not sent again", async () => {
    await using resource = createResource();
    const server = makeServer(resource);
    const opts = server.trpc.post.byDay.queryOptions({
      day: new Date("2026-01-01"),
    });

    void server.queryClient.prefetchQuery(opts);
    expect(dehydrateUnsent(server.queryClient).queries).toHaveLength(1);
    await server.queryClient.ensureQueryData(opts);
    expect(dehydrateUnsent(server.queryClient).queries).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 2));
    server.queryClient.setQueryData(opts.queryKey, (old) =>
      old == null ? old : { ...old, version: 99 },
    );
    expect(dehydrateUnsent(server.queryClient).queries).toHaveLength(1);
  });

  it("sends each mutation once", async () => {
    await using resource = createResource();
    const server = makeServer(resource);
    server.queryClient.setDefaultOptions({
      ...server.queryClient.getDefaultOptions(),
      dehydrate: {
        ...server.queryClient.getDefaultOptions().dehydrate,
        shouldDehydrateMutation: () => true,
      },
    });

    await new MutationObserver(
      server.queryClient,
      server.trpc.post.like.mutationOptions(),
    ).mutate({ id: 1 });
    expect(dehydrateUnsent(server.queryClient).mutations).toHaveLength(1);
    expect(dehydrateUnsent(server.queryClient).mutations).toEqual([]);

    await new MutationObserver(
      server.queryClient,
      server.trpc.post.like.mutationOptions(),
    ).mutate({ id: 2 });
    expect(dehydrateUnsent(server.queryClient).mutations).toHaveLength(1);
  });

  it("hydrates the browser client from nested loads without fetching again", async () => {
    await using resource = createResource();
    const server = makeServer(resource);

    void server.queryClient.prefetchQuery(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    const outerState = dehydrateUnsent(server.queryClient);
    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date("2026-01-02") }),
    );
    const innerState = dehydrateUnsent(server.queryClient);

    const browser = resource.queryClient;
    hydrate(browser, outerState);
    hydrate(browser, innerState);

    const trpc = resource.optionsProxyClient;
    const first = await browser.ensureQueryData(
      trpc.post.byDay.queryOptions({ day: new Date("2026-01-01") }),
    );
    const second = await browser.ensureQueryData(
      trpc.post.byDay.queryOptions({ day: new Date("2026-01-02") }),
    );

    expect(first.title).toBe("Posts on 2026-01-01");
    expect(first.fetchedAt).toBeInstanceOf(Date);
    expect(second.title).toBe("Posts on 2026-01-02");
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(resource.linkSpy.up).not.toHaveBeenCalled();
  });

  it("a pending query that fails reaches the browser as an error", async () => {
    await using resource = createResource();
    const server = makeServer(resource);

    void server.queryClient.prefetchQuery({
      ...server.trpc.post.missing.queryOptions(),
      retry: false,
    });
    const state = dehydrateUnsent(server.queryClient);
    expect(state.queries).toHaveLength(1);

    const browser = resource.queryClient;
    hydrate(browser, state);
    const queryKey = resource.optionsProxyClient.post.missing.queryKey();
    await vi.waitFor(() => {
      expect(browser.getQueryState(queryKey)?.status).toBe("error");
    });
  });
});
