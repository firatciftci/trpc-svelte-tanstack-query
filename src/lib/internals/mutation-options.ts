import type {
  CreateMutationOptions,
  MutationFunction,
  QueryClient,
} from "@tanstack/svelte-query";
import type { TRPCClientErrorLike, TRPCUntypedClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import type {
  AnyTRPCMutationKey,
  DistributiveOmit,
  FeatureFlags,
  KeyPrefixOptions,
  MaybePromise,
  ResolverDef,
  TRPCMutationKey,
  TRPCQueryBaseOptions,
  TRPCQueryOptionsResult,
} from "#lib/internals/types.js";
import {
  createTRPCOptionsResult,
  getClientArgs,
  getMutationKeyInternal,
  unwrapLazyArg,
} from "#lib/internals/utils.js";

type ReservedOptions = "mutationKey" | "mutationFn";

type TRPCMutationOptionsIn<
  TInput,
  TError,
  TOutput,
  TContext,
  TFeatureFlags extends FeatureFlags,
> = DistributiveOmit<
  CreateMutationOptions<TOutput, TError, TInput, TContext>,
  ReservedOptions
> &
  TRPCQueryBaseOptions &
  Partial<KeyPrefixOptions<TFeatureFlags>>;

interface TRPCMutationOptionsOut<
  TInput,
  TError,
  TOutput,
  TContext,
  TFeatureFlags extends FeatureFlags,
>
  extends
    CreateMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCQueryOptionsResult {
  mutationKey: TRPCMutationKey<TFeatureFlags["keyPrefix"]>;
}

/**
The `mutationOptions` helper on a mutation procedure. Returns options for `createMutation`.
*/
export interface TRPCMutationOptions<
  TDef extends ResolverDef,
  TFeatureFlags extends FeatureFlags = TDef["featureFlags"],
> {
  <TContext = unknown>(
    opts?: TRPCMutationOptionsIn<
      TDef["input"],
      TRPCClientErrorLike<TDef>,
      TDef["output"],
      TContext,
      TFeatureFlags
    >,
  ): TRPCMutationOptionsOut<
    TDef["input"],
    TRPCClientErrorLike<TDef>,
    TDef["output"],
    TContext,
    TFeatureFlags
  >;
}

export interface MutationOptionsOverride {
  onSuccess: (opts: {
    originalFn: () => MaybePromise<unknown>;
    queryClient: QueryClient;
    meta: Record<string, unknown>;
  }) => MaybePromise<unknown>;
}

type AnyTRPCMutationOptionsIn = DistributiveOmit<
  CreateMutationOptions<unknown, unknown, unknown, unknown>,
  ReservedOptions
> &
  TRPCQueryBaseOptions & { keyPrefix?: string };

type AnyTRPCMutationOptionsOut = CreateMutationOptions<
  unknown,
  unknown,
  unknown,
  unknown
> &
  TRPCQueryOptionsResult & { mutationKey: AnyTRPCMutationKey };

export function trpcMutationOptions(args: {
  mutate: TRPCUntypedClient<AnyTRPCRouter>["mutation"];
  queryClient: QueryClient | (() => QueryClient);
  path: Array<string>;
  prefix: string | undefined;
  opts: AnyTRPCMutationOptionsIn | undefined;
  overrides: MutationOptionsOverride | undefined;
}): AnyTRPCMutationOptionsOut {
  const { mutate, path, prefix, opts, overrides } = args;
  const queryClient = unwrapLazyArg(args.queryClient);

  const mutationKey = getMutationKeyInternal({
    path,
    prefix: opts?.keyPrefix ?? prefix,
  });

  const defaultOpts = queryClient.defaultMutationOptions(
    queryClient.getMutationDefaults(mutationKey),
  );

  const mutationSuccessOverride: MutationOptionsOverride["onSuccess"] =
    overrides?.onSuccess ?? ((options) => options.originalFn());

  const mutationFn: MutationFunction<unknown, unknown> = async (input) =>
    mutate(...getClientArgs([...mutationKey, { input }], opts));

  return {
    ...opts,
    mutationKey,
    mutationFn,
    onSuccess(...successArgs) {
      const originalFn = (): MaybePromise<unknown> =>
        opts?.onSuccess?.(...successArgs) ??
        defaultOpts.onSuccess?.(...successArgs);

      return mutationSuccessOverride({
        originalFn,
        queryClient,
        meta: opts?.meta ?? defaultOpts.meta ?? {},
      });
    },
    trpc: createTRPCOptionsResult({ path }),
  };
}
