import type { InfiniteData } from "@tanstack/svelte-query";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { inferRouterError } from "@trpc/server";
import {
  createInfiniteQuery,
  infiniteQueryOptions,
  QueryClient,
  skipToken,
} from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expectTypeOf, test } from "vitest";
import { z } from "zod";
import type { TRPCOptionsProxy } from "#lib/index.js";

const t = initTRPC.create({});

const _appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => "__result" as const),
    list: t.procedure
      .input(z.object({ cursor: z.number().default(0) }))
      .query(() => ({
        items: [] as Array<string>,
        next: undefined as number | undefined,
      })),
  }),
});

type AppRouter = typeof _appRouter;
type Page = { items: Array<string>; next?: number | undefined };

declare const trpc: TRPCOptionsProxy<AppRouter>;

describe("infiniteQueryOptions types", () => {
  test("basic", async () => {
    const queryClient = new QueryClient();
    const queryOptions = trpc.post.list.infiniteQueryOptions(
      {},
      {
        getNextPageParam(lastPage) {
          expectTypeOf(lastPage).toExtend<Page>();
          return lastPage.next;
        },
      },
    );
    const query = createInfiniteQuery(() => queryOptions);

    expectTypeOf(query.data).toExtend<
      InfiniteData<Page, number | null> | undefined
    >();
    expectTypeOf(query.error).toEqualTypeOf<TRPCClientErrorLike<{
      transformer: false;
      errorShape: inferRouterError<AppRouter>;
    }> | null>();

    const queryKey = trpc.post.list.infiniteQueryKey({});
    expectTypeOf(queryKey).toEqualTypeOf<typeof queryOptions.queryKey>();
    expectTypeOf(queryClient.getQueryData(queryKey)).toEqualTypeOf<
      typeof query.data
    >();

    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      expectTypeOf(data).toEqualTypeOf<typeof query.data>();
      return data;
    });

    await queryClient.invalidateQueries(
      trpc.post.list.infiniteQueryFilter(
        {},
        {
          predicate(opts) {
            expectTypeOf(opts.state.data).toBeUnknown();
            return true;
          },
        },
      ),
    );

    const fetched = await queryClient.fetchInfiniteQuery(queryOptions);
    expectTypeOf(fetched).toExtend<{
      pages: Array<Page>;
      pageParams: Array<number | null>;
    }>();
  });

  test("regression #6701: getNextPageParam is mandatory", () => {
    // @ts-expect-error getNextPageParam is mandatory
    trpc.post.list.infiniteQueryOptions({}, {});

    // @ts-expect-error the second parameter is mandatory because it has mandatory keys
    trpc.post.list.infiniteQueryOptions({});

    // @ts-expect-error getNextPageParam is mandatory in TanStack Query
    infiniteQueryOptions({
      queryFn: skipToken,
      queryKey: [1],
      initialPageParam: 0,
      initialData: { pages: [], pageParams: [] },
    });

    const skipQueryOptions = trpc.post.list.infiniteQueryOptions(skipToken, {
      initialData: { pages: [], pageParams: [] },
      getNextPageParam: () => 1,
    });
    expectTypeOf(skipQueryOptions.trpc.path).toEqualTypeOf<string>();
  });

  test("no infinite helpers on procedures without a cursor", () => {
    expectTypeOf(trpc.post.byId).not.toHaveProperty("infiniteQueryOptions");
    expectTypeOf(trpc.post.byId).not.toHaveProperty("infiniteQueryKey");
    expectTypeOf(trpc.post.byId).not.toHaveProperty("infiniteQueryFilter");
  });

  test("select", () => {
    const query = createInfiniteQuery(() =>
      trpc.post.list.infiniteQueryOptions(
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
      ),
    );
    expectTypeOf(query.data).toExtend<
      InfiniteData<Page, number | null> | undefined
    >();
    expectTypeOf(query.data!.pages[0]!.___selected).toEqualTypeOf<true>();
  });

  test("initialCursor takes the cursor type", () => {
    trpc.post.list.infiniteQueryOptions(
      {},
      { initialCursor: 1, getNextPageParam: () => 1 },
    );
    trpc.post.list.infiniteQueryOptions(
      {},
      // @ts-expect-error the cursor is a number
      { initialCursor: "1", getNextPageParam: () => 1 },
    );
  });
});
