import type {
  CreateInfiniteQueryOptions,
  DataTag,
  DefinedInitialDataInfiniteOptions,
  OmitKeyof,
  QueryFunction,
  QueryKey,
  SkipToken,
  UndefinedInitialDataInfiniteOptions,
} from "@tanstack/svelte-query";
import type { TRPCClientErrorLike, TRPCUntypedClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import { skipToken } from "@tanstack/svelte-query";
import type {
  DistributiveOmit,
  ExtractCursorType,
  FeatureFlags,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from "#lib/internals/types.js";
import {
  createTRPCOptionsResult,
  getClientArgs,
  isObject,
} from "#lib/internals/utils.js";

export type UnusedSkipTokenInfiniteOptions<
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = OmitKeyof<
  CreateInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
  "queryFn"
> & {
  queryFn?: Exclude<
    CreateInfiniteQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TPageParam
    >["queryFn"],
    SkipToken | undefined
  >;
};

type ReservedOptions =
  | "queryKey"
  | "queryFn"
  | "queryHashFn"
  | "queryHash"
  | "initialPageParam";

type CursorOf<TInput> = NonNullable<ExtractCursorType<TInput>> | null;

type ErrorOfDef<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef["transformer"];
  errorShape: TDef["errorShape"];
}>;

interface UndefinedTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
        CursorOf<TInput>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: CursorOf<TInput>;
}

interface UndefinedTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
        CursorOf<TInput>
      >,
      "initialPageParam"
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: CursorOf<TInput>;
}

interface DefinedTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
        CursorOf<TInput>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: CursorOf<TInput>;
}

export interface DefinedTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
        CursorOf<TInput>
      >,
      "initialPageParam"
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: CursorOf<TInput>;
}

export interface UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
        CursorOf<TInput>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {
  initialCursor?: CursorOf<TInput>;
}

export interface UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
        CursorOf<TInput>
      >,
      "initialPageParam"
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: CursorOf<TInput>;
}

/**
The `infiniteQueryOptions` helper on a query procedure. Returns options for `createInfiniteQuery`, `queryClient.prefetchInfiniteQuery`, and so on.
*/
export interface TRPCInfiniteQueryOptions<TDef extends ResolverDef> {
  <TQueryFnData extends TDef["output"], TData = TQueryFnData>(
    input: TDef["input"] | SkipToken,
    opts: DefinedTRPCInfiniteQueryOptionsIn<
      TDef["input"],
      TQueryFnData,
      TData,
      ErrorOfDef<TDef>,
      TDef["featureFlags"]
    >,
  ): DefinedTRPCInfiniteQueryOptionsOut<
    TDef["input"],
    TQueryFnData,
    TData,
    ErrorOfDef<TDef>,
    TDef["featureFlags"]
  >;
  <TQueryFnData extends TDef["output"], TData = TQueryFnData>(
    input: TDef["input"],
    opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
      TDef["input"],
      TQueryFnData,
      TData,
      ErrorOfDef<TDef>,
      TDef["featureFlags"]
    >,
  ): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
    TDef["input"],
    TQueryFnData,
    TData,
    ErrorOfDef<TDef>,
    TDef["featureFlags"]
  >;
  <TQueryFnData extends TDef["output"], TData = TQueryFnData>(
    input: TDef["input"] | SkipToken,
    opts: UndefinedTRPCInfiniteQueryOptionsIn<
      TDef["input"],
      TQueryFnData,
      TData,
      ErrorOfDef<TDef>,
      TDef["featureFlags"]
    >,
  ): UndefinedTRPCInfiniteQueryOptionsOut<
    TDef["input"],
    TQueryFnData,
    TData,
    ErrorOfDef<TDef>,
    TDef["featureFlags"]
  >;
}

type AnyTRPCInfiniteQueryOptionsIn<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCInfiniteQueryOptionsIn<
      unknown,
      unknown,
      unknown,
      unknown,
      TFeatureFlags
    >
  | UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
      unknown,
      unknown,
      unknown,
      unknown,
      TFeatureFlags
    >
  | UndefinedTRPCInfiniteQueryOptionsIn<
      unknown,
      unknown,
      unknown,
      unknown,
      TFeatureFlags
    >;

type AnyTRPCInfiniteQueryOptionsOut<TFeatureFlags extends FeatureFlags> =
  | DefinedTRPCInfiniteQueryOptionsOut<
      unknown,
      unknown,
      unknown,
      unknown,
      TFeatureFlags
    >
  | UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
      unknown,
      unknown,
      unknown,
      unknown,
      TFeatureFlags
    >
  | UndefinedTRPCInfiniteQueryOptionsOut<
      unknown,
      unknown,
      unknown,
      unknown,
      TFeatureFlags
    >;

export function trpcInfiniteQueryOptions<
  TFeatureFlags extends FeatureFlags,
>(args: {
  input: unknown;
  query: TRPCUntypedClient<AnyTRPCRouter>["query"];
  path: Array<string>;
  queryKey: TRPCQueryKey<TFeatureFlags["keyPrefix"]>;
  opts: AnyTRPCInfiniteQueryOptionsIn<TFeatureFlags> | undefined;
}): AnyTRPCInfiniteQueryOptionsOut<TFeatureFlags> {
  const { input, query, path, queryKey, opts } = args;

  const queryFn: QueryFunction<
    unknown,
    TRPCQueryKey<TFeatureFlags["keyPrefix"]>,
    unknown
  > = async (queryFnContext) => {
    const actualOpts = {
      ...opts,
      trpc: {
        ...opts?.trpc,
        signal:
          opts?.trpc?.abortOnUnmount === true
            ? queryFnContext.signal
            : undefined,
      },
    };

    return query(
      ...getClientArgs(queryKey, actualOpts, {
        direction: queryFnContext.direction,
        pageParam: queryFnContext.pageParam,
      }),
    );
  };

  return {
    ...opts,
    queryKey,
    queryFn: input === skipToken ? skipToken : queryFn,
    initialPageParam:
      opts?.initialCursor ?? (isObject(input) ? input.cursor : undefined),
    trpc: createTRPCOptionsResult({ path }),
  } as AnyTRPCInfiniteQueryOptionsOut<TFeatureFlags>;
}
