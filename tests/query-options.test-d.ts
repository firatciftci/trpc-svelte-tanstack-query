import type { TRPCClientErrorLike } from "@trpc/client";
import type { inferRouterError } from "@trpc/server";
import { createQuery, QueryClient, skipToken } from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expectTypeOf, test } from "vitest";
import { z } from "zod";
import type { TRPCOptionsProxy } from "#lib/index.js";

type Post = { id: string; title: string };

const t = initTRPC.create({});

const _appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => "__result" as const),
    iterable: t.procedure.query(async function* () {
      yield 1;
    }),
    list: t.procedure.query((): Array<Post> => []),
  }),
});

type AppRouter = typeof _appRouter;
type AppError = TRPCClientErrorLike<{
  transformer: false;
  errorShape: inferRouterError<AppRouter>;
}>;

declare const trpc: TRPCOptionsProxy<AppRouter>;
declare const prefixed: TRPCOptionsProxy<AppRouter, { keyPrefix: true }>;

describe("queryOptions types", () => {
  test("basic", () => {
    const options = trpc.post.byId.queryOptions({ id: "1" });
    expectTypeOf(options.trpc.path).toEqualTypeOf<string>();
    const query1 = createQuery(() => options);
    const query2 = createQuery(() => trpc.post.byId.queryOptions({ id: "1" }));
    expectTypeOf(query1).toEqualTypeOf(query2);
    expectTypeOf(query1.data).toEqualTypeOf<"__result" | undefined>();
    expectTypeOf(query1.error).toEqualTypeOf<AppError | null>();
  });

  test("select", () => {
    const query = createQuery(() =>
      trpc.post.byId.queryOptions(
        { id: "1" },
        { select: (data) => `mutated${data}` as const },
      ),
    );
    expectTypeOf(query.data).toEqualTypeOf<"mutated__result" | undefined>();
  });

  test("initialData", () => {
    const query = createQuery(() =>
      trpc.post.byId.queryOptions({ id: "1" }, { initialData: "__result" }),
    );
    expectTypeOf(query.data).toEqualTypeOf<"__result">();
  });

  test("skipToken", () => {
    const options = trpc.post.byId.queryOptions(skipToken);
    const query1 = createQuery(() => options);
    const query2 = createQuery(() => trpc.post.byId.queryOptions(skipToken));
    expectTypeOf(query1.data).toEqualTypeOf<"__result" | undefined>();
    expectTypeOf(query2.data).toEqualTypeOf<"__result" | undefined>();
  });

  test("regression #6701: skipToken options keep a skipToken queryFn type", () => {
    const options = trpc.post.byId.queryOptions(skipToken);
    expectTypeOf(options.queryFn).toExtend<
      typeof skipToken | undefined | ((...args: Array<never>) => unknown)
    >();
    const unskipped = trpc.post.byId.queryOptions({ id: "1" });
    expectTypeOf(unskipped.queryFn).not.toExtend<typeof skipToken>();
  });

  test("iterable", () => {
    const query = createQuery(() =>
      trpc.post.iterable.queryOptions(undefined, {
        select(data) {
          expectTypeOf(data).toEqualTypeOf<Array<number>>();
          return data;
        },
      }),
    );
    expectTypeOf(query.data).toEqualTypeOf<Array<number> | undefined>();
  });

  test("initialData inference", () => {
    const query = createQuery(() =>
      trpc.post.list.queryOptions(undefined, { initialData: [] }),
    );
    expectTypeOf(query.data).toEqualTypeOf<Array<Post>>();
  });

  test("initialData inference + select", () => {
    const noPostSymbol = Symbol("noPost");
    const query = createQuery(() =>
      trpc.post.list.queryOptions(undefined, {
        initialData: [],
        select: (data) => data[0] ?? noPostSymbol,
      }),
    );
    expectTypeOf(query.data).toEqualTypeOf<Post | typeof noPostSymbol>();
  });

  test("fetchQuery and the cache infer the output", async () => {
    const queryClient = new QueryClient();
    const options = trpc.post.byId.queryOptions({ id: "1" });
    expectTypeOf(
      await queryClient.fetchQuery(options),
    ).toEqualTypeOf<"__result">();
    expectTypeOf(queryClient.getQueryData(options.queryKey)).toEqualTypeOf<
      "__result" | undefined
    >();
  });

  test("the query key follows the keyPrefix feature flag", () => {
    expectTypeOf(
      prefixed.post.byId.queryOptions({ id: "1" }).queryKey[0],
    ).toEqualTypeOf<Array<string>>();
    expectTypeOf(
      prefixed.post.byId.queryOptions({ id: "1" }).queryKey,
    ).toHaveProperty("2");
    expectTypeOf(
      trpc.post.byId.queryOptions({ id: "1" }).queryKey,
    ).not.toHaveProperty("2");
  });
});
