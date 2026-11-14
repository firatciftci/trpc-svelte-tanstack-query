import {
  createInfiniteQuery,
  createQuery,
  QueryClient,
} from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { z } from "zod";
import {
  ensureEntry,
  fetchInfiniteEntry,
  loadHandles,
} from "#lib/unstable-handles/index.js";
import QueryProbe from "#tests/fixtures/handles/query-probe.svelte";
import { createLocalResource } from "#tests/helpers/local.js";

function ctx() {
  const t = initTRPC.create({ allowOutsideOfServer: true });
  const calls = vi.fn<(path: string, input: unknown) => void>();
  const appRouter = t.router({
    post: t.router({
      search: t.procedure
        .input(z.object({ term: z.string(), limit: z.number() }))
        .query((opts) => {
          calls("post.search", opts.input);
          return `${opts.input.term}:${opts.input.limit}`;
        }),
      comments: t.procedure
        .input(
          z.object({
            postId: z.string(),
            limit: z.number().optional(),
            cursor: z.number().nullish(),
          }),
        )
        .query((opts) => {
          calls("post.comments", opts.input);
          const start = opts.input.cursor ?? 0;
          const count = opts.input.limit ?? 2;
          return {
            items: Array.from({ length: count }, (_, index) => start + index),
            nextCursor: start + count,
          };
        }),
    }),
  });
  const resource = createLocalResource(appRouter, {
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    }),
  });
  return { ...resource, calls };
}

describe("a component that changes a handle's input with queryOptions", () => {
  it("reads the load's query while the input matches, then the new one", async () => {
    using resource = ctx();
    const trpc = resource.optionsProxy;
    const [{ results }] = await loadHandles(trpc, {
      results: ensureEntry(trpc.post.search, { term: "a", limit: 2 }),
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    let term = $state(results.input.term);
    const screen = await render(QueryProbe, {
      create: () =>
        createQuery(
          () => trpc.post.search.queryOptions({ ...results.input, term }),
          () => resource.queryClient,
        ),
    });
    await expect.element(screen.getByText('data:"a:2"')).toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(1);

    term = "b";
    flushSync();
    await expect.element(screen.getByText('data:"b:2"')).toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(2);
  });

  it("works for infinite handles with infiniteQueryOptions", async () => {
    using resource = ctx();
    const trpc = resource.optionsProxy;
    const [{ comments }] = await loadHandles(trpc, {
      comments: fetchInfiniteEntry(trpc.post.comments, {
        postId: "1",
        limit: 2,
      }),
    });
    expect(resource.calls).toHaveBeenCalledTimes(1);

    let limit = $state(comments.input.limit);
    const screen = await render(QueryProbe, {
      create: () =>
        createInfiniteQuery(
          () =>
            trpc.post.comments.infiniteQueryOptions(
              { ...comments.input, limit },
              { getNextPageParam: (last) => last.nextCursor },
            ),
          () => resource.queryClient,
        ),
    });
    await expect
      .element(screen.getByText(/"items":\[0,1\]/))
      .toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(1);

    limit = 3;
    flushSync();
    await expect
      .element(screen.getByText(/"items":\[0,1,2\]/))
      .toBeInTheDocument();
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(resource.calls).toHaveBeenLastCalledWith("post.comments", {
      postId: "1",
      limit: 3,
    });
  });
});
