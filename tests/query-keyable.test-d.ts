import type { QueryClient } from "@tanstack/svelte-query";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { inferRouterError } from "@trpc/server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { describe, expectTypeOf, test } from "vitest";
import { z } from "zod";
import type {
  AnyTRPCQueryKey,
  SetTRPCContextOptions,
  TRPCMutationKeyWithoutPrefix,
  TRPCMutationKeyWithPrefix,
  TRPCOptionsProxy,
  TRPCQueryKeyWithoutPrefix,
  TRPCQueryKeyWithPrefix,
} from "#lib/index.js";
import { createTRPCContext } from "#lib/index.js";

const t = initTRPC.create({
  errorFormatter(formatter) {
    return { foo: 1, ...formatter.shape };
  },
});

const _appRouter = t.router({
  bluesky: {
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => "__result" as const),
      create: t.procedure.mutation(() => "__mutationResult" as const),
    }),
  },
});

type AppRouter = typeof _appRouter;
type AppError = TRPCClientErrorLike<{
  transformer: false;
  errorShape: inferRouterError<AppRouter>;
}>;

declare const trpc: TRPCOptionsProxy<AppRouter>;
declare const prefixed: TRPCOptionsProxy<AppRouter, { keyPrefix: true }>;
declare const queryClient: QueryClient;

describe("query filter types", () => {
  test("type inference for query filters", () => {
    const filter = trpc.bluesky.post.byId.queryFilter(
      { id: "1" },
      {
        predicate(query) {
          expectTypeOf(query.setData("__result")).toBeUnknown();
          expectTypeOf(query.queryKey).toExtend<ReadonlyArray<unknown>>();
          return true;
        },
      },
    );
    expectTypeOf(filter.queryKey).toExtend<AnyTRPCQueryKey>();
    expectTypeOf(queryClient.getQueryData(filter.queryKey)).toEqualTypeOf<
      "__result" | undefined
    >();
  });
});

describe("query key types", () => {
  test("type inference for query keys", () => {
    expectTypeOf(
      queryClient.getQueryData(trpc.bluesky.post.byId.queryKey({ id: "1" })),
    ).toEqualTypeOf<"__result" | undefined>();
    expectTypeOf(
      queryClient.setQueryData(
        trpc.bluesky.post.byId.queryKey({ id: "1" }),
        "__result",
      ),
    ).toEqualTypeOf<"__result" | undefined>();
    queryClient.setQueryData(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
      // @ts-expect-error the data has the procedure's output type
      "other",
    );
  });

  test("type inference for getQueryState", () => {
    const state = queryClient.getQueryState(
      trpc.bluesky.post.byId.queryKey({ id: "1" }),
    );
    expectTypeOf(state?.data).toEqualTypeOf<"__result" | undefined>();
    expectTypeOf(state?.error).toEqualTypeOf<AppError | null | undefined>();
  });

  test("keys follow the keyPrefix feature flag", () => {
    expectTypeOf(
      prefixed.bluesky.pathKey(),
    ).toEqualTypeOf<TRPCQueryKeyWithPrefix>();
    expectTypeOf(
      prefixed.bluesky.post.create.mutationKey(),
    ).toEqualTypeOf<TRPCMutationKeyWithPrefix>();
    expectTypeOf(
      trpc.bluesky.pathKey(),
    ).toEqualTypeOf<TRPCQueryKeyWithoutPrefix>();
    expectTypeOf(
      trpc.bluesky.post.create.mutationKey(),
    ).toEqualTypeOf<TRPCMutationKeyWithoutPrefix>();
  });

  test("only mutations have mutation keys", () => {
    // @ts-expect-error not a mutation
    void trpc.bluesky.post.byId.mutationKey;
    // @ts-expect-error not a mutation
    void trpc.bluesky.mutationKey;
  });
});

describe("setTRPCContext options", () => {
  const _trpcClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "http://localhost:3000" })],
  });

  test("keyPrefix needs the feature flag", () => {
    expectTypeOf<{
      trpcClient: typeof _trpcClient;
      queryClient: QueryClient;
    }>().toExtend<SetTRPCContextOptions<AppRouter>>();
    expectTypeOf<{
      trpcClient: typeof _trpcClient;
      keyPrefix: string;
    }>().not.toExtend<SetTRPCContextOptions<AppRouter>>();
    expectTypeOf<{ trpcClient: typeof _trpcClient }>().not.toExtend<
      SetTRPCContextOptions<AppRouter, { keyPrefix: true }>
    >();
    expectTypeOf<{
      trpcClient: typeof _trpcClient;
      keyPrefix: string;
    }>().toExtend<SetTRPCContextOptions<AppRouter, { keyPrefix: true }>>();
  });

  test("createTRPCContext types useTRPC with the feature flags", () => {
    const plain = createTRPCContext<AppRouter>();
    const withPrefix = createTRPCContext<AppRouter, { keyPrefix: true }>();
    expectTypeOf(plain.useTRPC).returns.toEqualTypeOf<
      TRPCOptionsProxy<AppRouter>
    >();
    expectTypeOf(withPrefix.useTRPC).returns.toEqualTypeOf<
      TRPCOptionsProxy<AppRouter, { keyPrefix: true }>
    >();
    expectTypeOf(plain.useTRPCClient).returns.toEqualTypeOf<
      typeof _trpcClient
    >();
  });
});
