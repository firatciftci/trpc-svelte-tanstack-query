import type {
  DataTag,
  QueryClient,
  QueryFilters,
} from "@tanstack/svelte-query";
import type {
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
} from "@trpc/client";
import type {
  AnyTRPCProcedure,
  AnyTRPCRootTypes,
  AnyTRPCRouter,
  inferProcedureErrorShape,
  inferProcedureInput,
  inferRouterContext,
  inferTransformedProcedureOutput,
  TRPCProcedureType,
  TRPCRouterRecord,
} from "@trpc/server";
import { getUntypedClient, TRPCUntypedClient } from "@trpc/client";
import { callTRPCProcedure, createTRPCRecursiveProxy } from "@trpc/server";
import type { TRPCInfiniteQueryOptions } from "#lib/internals/infinite-query-options.js";
import type {
  MutationOptionsOverride,
  TRPCMutationOptions,
} from "#lib/internals/mutation-options.js";
import type { TRPCQueryOptions } from "#lib/internals/query-options.js";
import type { TRPCSubscriptionOptions } from "#lib/internals/subscription-options.js";
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  KeyPrefixOptions,
  MaybePromise,
  OptionalCursorInput,
  ResolverDef,
  TRPCInfiniteData,
  TRPCMutationKey,
  TRPCQueryKey,
  WithRequired,
} from "#lib/internals/types.js";
import { trpcInfiniteQueryOptions } from "#lib/internals/infinite-query-options.js";
import { trpcMutationOptions } from "#lib/internals/mutation-options.js";
import { trpcQueryOptions } from "#lib/internals/query-options.js";
import { trpcSubscriptionOptions } from "#lib/internals/subscription-options.js";
import {
  getMutationKeyInternal,
  getQueryKeyInternal,
  unwrapLazyArg,
} from "#lib/internals/utils.js";

type ErrorOfDef<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef["transformer"];
  errorShape: TDef["errorShape"];
}>;

type QueryKeyOfDef<TDef extends ResolverDef> = TRPCQueryKey<
  TDef["featureFlags"]["keyPrefix"]
>;

/**
Key and filter helpers for a router path.
*/
export interface DecorateRouterKeyable<TFeatureFlags extends FeatureFlags> {
  /**
  The query key for this path, which matches every procedure beneath it.
  */
  pathKey: () => TRPCQueryKey<TFeatureFlags["keyPrefix"]>;

  /**
  A query filter for this path, which matches every procedure beneath it.
  */
  pathFilter: (
    filters?: QueryFilters<TRPCQueryKey<TFeatureFlags["keyPrefix"]>>,
  ) => WithRequired<
    QueryFilters<TRPCQueryKey<TFeatureFlags["keyPrefix"]>>,
    "queryKey"
  >;
}

interface TypeHelper<TDef extends ResolverDef> {
  "~types": {
    input: TDef["input"];
    output: TDef["output"];
    errorShape: TDef["errorShape"];
  };
}

type AnyTypeHelper = {
  "~types": { input: unknown; output: unknown; errorShape: unknown };
};

/**
The input type of a procedure on the options proxy.
*/
export type inferInput<TProcedure extends AnyTypeHelper> =
  TProcedure["~types"]["input"];

/**
The output type of a procedure on the options proxy.
*/
export type inferOutput<TProcedure extends AnyTypeHelper> =
  TProcedure["~types"]["output"];

/**
The helpers for a query procedure whose input has a `cursor`.
*/
export interface DecorateInfiniteQueryProcedure<
  TDef extends ResolverDef,
> extends TypeHelper<TDef> {
  /**
  Type-safe options for `createInfiniteQuery`, `queryClient.prefetchInfiniteQuery`, and so on.
  */
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TDef>;

  /**
  The query key of an infinite query of this procedure.
  */
  infiniteQueryKey: (
    input?: Partial<TDef["input"]>,
  ) => DataTag<
    QueryKeyOfDef<TDef>,
    TRPCInfiniteData<TDef["input"], TDef["output"]>,
    ErrorOfDef<TDef>
  >;

  /**
  A query filter for infinite queries of this procedure.
  */
  infiniteQueryFilter: (
    input?: Partial<TDef["input"]>,
    filters?: QueryFilters<
      DataTag<
        QueryKeyOfDef<TDef>,
        TRPCInfiniteData<TDef["input"], TDef["output"]>,
        ErrorOfDef<TDef>
      >
    >,
  ) => WithRequired<
    QueryFilters<
      DataTag<
        QueryKeyOfDef<TDef>,
        TRPCInfiniteData<TDef["input"], TDef["output"]>,
        ErrorOfDef<TDef>
      >
    >,
    "queryKey"
  >;
}

/**
The helpers for a query procedure.
*/
export interface DecorateQueryProcedure<TDef extends ResolverDef>
  extends TypeHelper<TDef>, DecorateRouterKeyable<TDef["featureFlags"]> {
  /**
  Type-safe options for `createQuery`, `queryClient.prefetchQuery`, and so on.
  */
  queryOptions: TRPCQueryOptions<TDef>;

  /**
  The query key of a query of this procedure.
  */
  queryKey: (
    input?: Partial<TDef["input"]>,
  ) => DataTag<QueryKeyOfDef<TDef>, TDef["output"], ErrorOfDef<TDef>>;

  /**
  A query filter for queries of this procedure.
  */
  queryFilter: (
    input?: Partial<TDef["input"]>,
    filters?: QueryFilters<
      DataTag<QueryKeyOfDef<TDef>, TDef["output"], ErrorOfDef<TDef>>
    >,
  ) => WithRequired<
    QueryFilters<
      DataTag<QueryKeyOfDef<TDef>, TDef["output"], ErrorOfDef<TDef>>
    >,
    "queryKey"
  >;
}

/**
The helpers for a mutation procedure.
*/
export interface DecorateMutationProcedure<
  TDef extends ResolverDef,
> extends TypeHelper<TDef> {
  /**
  Type-safe options for `createMutation`.
  */
  mutationOptions: TRPCMutationOptions<TDef>;

  /**
  The mutation key of this procedure.
  */
  mutationKey: () => TRPCMutationKey<TDef["featureFlags"]["keyPrefix"]>;
}

/**
The helpers for a subscription procedure.
*/
export interface DecorateSubscriptionProcedure<
  TDef extends ResolverDef,
> extends TypeHelper<TDef> {
  /**
  Type-safe options for `createSubscription`.
  */
  subscriptionOptions: TRPCSubscriptionOptions<TDef>;
}

/**
The helpers for a procedure of the given type.
*/
export type DecorateProcedure<
  TType extends TRPCProcedureType,
  TDef extends ResolverDef,
> = TType extends "query"
  ? DecorateQueryProcedure<TDef> &
      (TDef["input"] extends OptionalCursorInput
        ? DecorateInfiniteQueryProcedure<TDef>
        : unknown)
  : TType extends "mutation"
    ? DecorateMutationProcedure<TDef>
    : TType extends "subscription"
      ? DecorateSubscriptionProcedure<TDef>
      : never;

export type DecoratedRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecoratedRouterRecord<TRoot, $Value, TFeatureFlags> &
          DecorateRouterKeyable<TFeatureFlags>
      : $Value extends AnyTRPCProcedure
        ? DecorateProcedure<
            $Value["_def"]["type"],
            {
              input: inferProcedureInput<$Value>;
              output: inferTransformedProcedureOutput<TRoot, $Value>;
              transformer: TRoot["transformer"];
              errorShape: inferProcedureErrorShape<TRoot, $Value>;
              featureFlags: TFeatureFlags;
            }
          >
        : never
    : never;
};

/**
The object returned by `useTRPC()` and `createTRPCOptionsProxy`. It mirrors your router and has query, mutation,
and subscription option helpers on each procedure.
*/
export type TRPCOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = DecoratedRouterRecord<
  TRouter["_def"]["_config"]["$types"],
  TRouter["_def"]["record"],
  TFeatureFlags
> &
  DecorateRouterKeyable<TFeatureFlags>;

/**
Options shared by every `createTRPCOptionsProxy` call.
*/
export type TRPCOptionsProxyOptionsBase<
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = {
  /**
  The `QueryClient`, or a function that returns it.
  */
  queryClient: QueryClient | (() => QueryClient);
  overrides?: { mutations?: MutationOptionsOverride };
} & KeyPrefixOptions<TFeatureFlags>;

/**
Call procedures on a router directly, for example in a SvelteKit server `load`.
*/
export interface TRPCOptionsProxyOptionsInternal<
  TRouter extends AnyTRPCRouter,
> {
  /**
  The router to call.
  */
  router: TRouter;
  /**
  The context for each call, or a function that returns it.
  */
  ctx:
    | inferRouterContext<TRouter>
    | (() => MaybePromise<inferRouterContext<TRouter>>);
}

/**
Call procedures through a tRPC client.
*/
export interface TRPCOptionsProxyOptionsExternal<
  TRouter extends AnyTRPCRouter,
> {
  /**
  The tRPC client to call procedures with.
  */
  client: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>;
}

/**
Options for `createTRPCOptionsProxy`. Pass either `client`, or `router` and `ctx`.
*/
export type TRPCOptionsProxyOptions<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = TRPCOptionsProxyOptionsBase<TFeatureFlags> &
  (
    | TRPCOptionsProxyOptionsInternal<TRouter>
    | TRPCOptionsProxyOptionsExternal<TRouter>
  );

type UtilsMethods =
  | "~types"
  | "~queryClient"
  | "pathKey"
  | "pathFilter"
  | "queryOptions"
  | "queryKey"
  | "queryFilter"
  | "infiniteQueryOptions"
  | "infiniteQueryKey"
  | "infiniteQueryFilter"
  | "mutationOptions"
  | "mutationKey"
  | "subscriptionOptions";

type UntypedClient = TRPCUntypedClient<AnyTRPCRouter>;

/**
Creates the options proxy outside of Svelte context. Use it in `load` functions, in hooks, and on the server.

@example
```ts
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });
```
*/
export function createTRPCOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(
  opts: TRPCOptionsProxyOptions<TRouter, TFeatureFlags>,
): TRPCOptionsProxy<TRouter, TFeatureFlags> {
  const keyPrefix: string | undefined = opts.keyPrefix;
  return createOptionsProxy<TRouter>({
    ...opts,
    keyPrefix,
  }) as TRPCOptionsProxy<TRouter, TFeatureFlags>;
}

export function createOptionsProxy<TRouter extends AnyTRPCRouter>(
  opts: Omit<TRPCOptionsProxyOptionsBase, "keyPrefix"> & {
    keyPrefix: string | undefined;
  } & (
      | TRPCOptionsProxyOptionsInternal<TRouter>
      | TRPCOptionsProxyOptionsExternal<TRouter>
    ),
): unknown {
  const prefix = opts.keyPrefix;

  function callIt<TType extends TRPCProcedureType>(
    type: TType,
  ): UntypedClient[TType] {
    const call = (
      path: string,
      input: unknown,
      trpcOpts: TRPCRequestOptions,
    ): unknown => {
      if ("router" in opts) {
        const { router, ctx } = opts;
        return (async (): Promise<unknown> => {
          const result: unknown = await callTRPCProcedure({
            router,
            path,
            getRawInput: async () => input,
            ctx: await unwrapLazyArg(ctx),
            type,
            signal: undefined,
            batchIndex: 0,
          });
          return result;
        })();
      }

      const untypedClient: UntypedClient =
        opts.client instanceof TRPCUntypedClient
          ? opts.client
          : getUntypedClient(opts.client);

      return (untypedClient[type] as (...args: Array<unknown>) => unknown)(
        path,
        input,
        trpcOpts,
      );
    };
    return call as UntypedClient[TType];
  }

  return createTRPCRecursiveProxy(({ args, path: proxyPath }) => {
    const path = [...proxyPath];
    const utilName = path.pop() as UtilsMethods;
    const [arg1, arg2] = args as [never, never];

    const contextMap: Record<UtilsMethods, () => unknown> = {
      "~types": () => {},
      "~queryClient": () => unwrapLazyArg(opts.queryClient),

      pathKey: () => getQueryKeyInternal({ path, type: "any", prefix }),
      pathFilter: (): QueryFilters => ({
        ...(arg1 as QueryFilters | undefined),
        queryKey: getQueryKeyInternal({ path, type: "any", prefix }),
      }),

      queryOptions: () =>
        trpcQueryOptions({
          input: arg1,
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: "query",
            prefix,
          }),
          query: callIt("query"),
        }),
      queryKey: () =>
        getQueryKeyInternal({ path, input: arg1, type: "query", prefix }),
      queryFilter: (): QueryFilters => ({
        ...(arg2 as QueryFilters | undefined),
        queryKey: getQueryKeyInternal({
          path,
          input: arg1,
          type: "query",
          prefix,
        }),
      }),

      infiniteQueryOptions: () =>
        trpcInfiniteQueryOptions({
          input: arg1,
          opts: arg2,
          path,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: "infinite",
            prefix,
          }),
          query: callIt("query"),
        }),
      infiniteQueryKey: () =>
        getQueryKeyInternal({ path, input: arg1, type: "infinite", prefix }),
      infiniteQueryFilter: (): QueryFilters => ({
        ...(arg2 as QueryFilters | undefined),
        queryKey: getQueryKeyInternal({
          path,
          input: arg1,
          type: "infinite",
          prefix,
        }),
      }),

      mutationOptions: () =>
        trpcMutationOptions({
          opts: arg1,
          path,
          prefix,
          queryClient: opts.queryClient,
          mutate: callIt("mutation"),
          overrides: opts.overrides?.mutations,
        }),
      mutationKey: () => getMutationKeyInternal({ path, prefix }),

      subscriptionOptions: () =>
        trpcSubscriptionOptions({
          opts: arg2,
          path,
          input: arg1,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: "any",
            prefix,
          }),
          subscribe: callIt("subscription"),
        }),
    };

    return contextMap[utilName]();
  });
}
