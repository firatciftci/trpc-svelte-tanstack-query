import type { TRPCClientErrorLike } from "@trpc/client";
import type { inferRouterError } from "@trpc/server";
import { createMutation } from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expectTypeOf, test } from "vitest";
import { z } from "zod";
import type {
  TRPCMutationKeyWithoutPrefix,
  TRPCMutationKeyWithPrefix,
  TRPCOptionsProxy,
} from "#lib/index.js";

const t = initTRPC.create({});

const _appRouter = t.router({
  post: t.router({
    list: t.procedure.query(() => ["initial"]),
    create: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(() => "__mutationResult" as const),
  }),
});

type AppRouter = typeof _appRouter;

declare const trpc: TRPCOptionsProxy<AppRouter>;
declare const prefixed: TRPCOptionsProxy<AppRouter, { keyPrefix: true }>;

describe("mutationOptions types", () => {
  test("callbacks and result", () => {
    const options = trpc.post.create.mutationOptions({
      onMutate(variables) {
        expectTypeOf(variables).toEqualTypeOf<{ text: string }>();
        return { previous: 1 };
      },
      onSettled(data, _error, _variables, context) {
        expectTypeOf(data).toEqualTypeOf<"__mutationResult" | undefined>();
        expectTypeOf(context).toEqualTypeOf<{ previous: number } | undefined>();
      },
      onSuccess(data) {
        expectTypeOf(data).toEqualTypeOf<"__mutationResult">();
      },
      onError(error) {
        expectTypeOf(error).toEqualTypeOf<
          TRPCClientErrorLike<{
            transformer: false;
            errorShape: inferRouterError<AppRouter>;
          }>
        >();
      },
    });
    const mutation = createMutation(() => options);
    expectTypeOf(mutation.data).toEqualTypeOf<"__mutationResult" | undefined>();
    expectTypeOf(mutation.mutate)
      .parameter(0)
      .toEqualTypeOf<{ text: string }>();
  });

  test("no opts", () => {
    const mutation = createMutation(() => trpc.post.create.mutationOptions());
    mutation.mutate(
      { text: "hello" },
      {
        onSettled(data) {
          expectTypeOf(data).toEqualTypeOf<"__mutationResult" | undefined>();
        },
        onSuccess(data) {
          expectTypeOf(data).toEqualTypeOf<"__mutationResult">();
        },
      },
    );
  });

  test("mutation keys follow the keyPrefix feature flag", () => {
    expectTypeOf(
      trpc.post.create.mutationKey(),
    ).toEqualTypeOf<TRPCMutationKeyWithoutPrefix>();
    expectTypeOf(
      prefixed.post.create.mutationKey(),
    ).toEqualTypeOf<TRPCMutationKeyWithPrefix>();
    expectTypeOf(
      trpc.post.create.mutationOptions().mutationKey,
    ).toEqualTypeOf<TRPCMutationKeyWithoutPrefix>();
    expectTypeOf(
      prefixed.post.create.mutationOptions().mutationKey,
    ).toEqualTypeOf<TRPCMutationKeyWithPrefix>();
  });

  test("keyPrefix is only accepted with the feature flag", () => {
    prefixed.post.create.mutationOptions({ keyPrefix: "other" });
    // @ts-expect-error keyPrefix needs the feature flag
    trpc.post.create.mutationOptions({ keyPrefix: "other" });
  });
});
