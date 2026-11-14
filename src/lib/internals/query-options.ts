import type {
  CreateQueryOptions,
  DataTag,
  DefinedInitialDataOptions,
  OmitKeyof,
  QueryClient,
  QueryFunction,
  QueryKey,
  SkipToken,
  UndefinedInitialDataOptions,
} from "@tanstack/svelte-query";
import type { TRPCClientErrorLike, TRPCUntypedClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import { queryOptions, skipToken } from "@tanstack/svelte-query";
import type {
  CoerceAsyncIterableToArray,
  DistributiveOmit,
  FeatureFlags,
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from "#lib/internals/types.js";
import {
  createTRPCOptionsResult,
  getClientArgs,
  isAsyncIterable,
  streamIntoQuery,
  unwrapLazyArg,
} from "#lib/internals/utils.js";

export type UnusedSkipTokenOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = OmitKeyof<
  CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  "queryFn"
> & {
  queryFn?: Exclude<
    CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>["queryFn"],
    SkipToken | undefined
  >;
};

type ReservedOptions = "queryKey" | "queryFn" | "queryHashFn" | "queryHash";

type ErrorOfDef<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef["transformer"];
  errorShape: TDef["errorShape"];
}>;

interface UndefinedTRPCQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      UndefinedInitialDataOptions<
        CoerceAsyncIterableToArray<TQueryFnData>,
        TError,
        CoerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UndefinedTRPCQueryOptionsOut<
  TQueryFnData,
  TOutput,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    UndefinedInitialDataOptions<
      CoerceAsyncIterableToArray<TQueryFnData>,
      TError,
      CoerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey<TFeatureFlags["keyPrefix"]>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    CoerceAsyncIterableToArray<TOutput>,
    TError
  >;
}

interface DefinedTRPCQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      DefinedInitialDataOptions<
        CoerceAsyncIterableToArray<NoInfer<TQueryFnData>>,
        TError,
        CoerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

export interface DefinedTRPCQueryOptionsOut<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DefinedInitialDataOptions<
      CoerceAsyncIterableToArray<TQueryFnData>,
      TError,
      CoerceAsyncIterableToArray<TData>,
      TRPCQueryKey<TFeatureFlags["keyPrefix"]>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    CoerceAsyncIterableToArray<TData>,
    TError
  >;
}

export interface UnusedSkipTokenTRPCQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenOptions<
        CoerceAsyncIterableToArray<TQueryFnData>,
        TError,
        CoerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

export interface UnusedSkipTokenTRPCQueryOptionsOut<
  TQueryFnData,
  TOutput,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    UnusedSkipTokenOptions<
      CoerceAsyncIterableToArray<TQueryFnData>,
      TError,
      CoerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey<TFeatureFlags["keyPrefix"]>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    CoerceAsyncIterableToArray<TOutput>,
    TError
  >;
}

/**
The `queryOptions` helper on a query procedure. Returns options for `createQuery`, `queryClient.prefetchQuery`, and so on.
*/
export interface TRPCQueryOptions<
  TDef extends ResolverDef,
  TFeatureFlags extends FeatureFlags = TDef["featureFlags"],
> {
  <TQueryFnData extends TDef["output"], TData = TQueryFnData>(
    input: TDef["input"] | SkipToken,
    opts: DefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      ErrorOfDef<TDef>,
      TFeatureFlags
    >,
  ): DefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    ErrorOfDef<TDef>,
    TFeatureFlags
  >;
  <TQueryFnData extends TDef["output"], TData = TQueryFnData>(
    input: TDef["input"],
    opts?: UnusedSkipTokenTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      ErrorOfDef<TDef>,
      TFeatureFlags
    >,
  ): UnusedSkipTokenTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    ErrorOfDef<TDef>,
    TFeatureFlags
  >;
  <TQueryFnData extends TDef["output"], TData = TQueryFnData>(
    input: TDef["input"] | SkipToken,
    opts?: UndefinedTRPCQueryOptionsIn<
      TQueryFnData,
      TData,
      ErrorOfDef<TDef>,
      TFeatureFlags
    >,
  ): UndefinedTRPCQueryOptionsOut<
    TQueryFnData,
    TData,
    ErrorOfDef<TDef>,
    TFeatureFlags
  >;
}

type AnyTRPCQueryOptionsIn<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCQueryOptionsIn<unknown, unknown, unknown, TFeatureFlags>
  | UnusedSkipTokenTRPCQueryOptionsIn<unknown, unknown, unknown, TFeatureFlags>
  | UndefinedTRPCQueryOptionsIn<unknown, unknown, unknown, TFeatureFlags>;

type AnyTRPCQueryOptionsOut<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCQueryOptionsOut<unknown, unknown, unknown, TFeatureFlags>
  | UnusedSkipTokenTRPCQueryOptionsOut<unknown, unknown, unknown, TFeatureFlags>
  | UndefinedTRPCQueryOptionsOut<unknown, unknown, unknown, TFeatureFlags>;

export function trpcQueryOptions<TFeatureFlags extends FeatureFlags>(args: {
  input: unknown;
  query: TRPCUntypedClient<AnyTRPCRouter>["query"];
  queryClient: QueryClient | (() => QueryClient);
  path: Array<string>;
  queryKey: TRPCQueryKey<TFeatureFlags["keyPrefix"]>;
  opts: AnyTRPCQueryOptionsIn<TFeatureFlags> | undefined;
}): AnyTRPCQueryOptionsOut<TFeatureFlags> {
  const { input, query, path, queryKey, opts } = args;
  const queryClient = unwrapLazyArg(args.queryClient);

  const queryFn: QueryFunction<
    unknown,
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>
  > = async (queryFnContext) => {
    const abortController = new AbortController();
    const actualOpts = {
      ...opts,
      trpc: {
        ...opts?.trpc,
        signal:
          opts?.trpc?.abortOnUnmount === true
            ? queryFnContext.signal
            : abortController.signal,
      },
    };

    const result = await query(
      ...getClientArgs(queryFnContext.queryKey, actualOpts),
    );

    if (isAsyncIterable(result)) {
      return streamIntoQuery({
        iterable: result,
        context: queryFnContext,
        queryClient,
        abortController,
      });
    }

    return result;
  };

  return Object.assign(
    queryOptions({
      ...opts,
      queryKey,
      queryFn: input === skipToken ? skipToken : queryFn,
    }),
    { trpc: createTRPCOptionsResult({ path }) },
  );
}
