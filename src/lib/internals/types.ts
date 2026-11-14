import type { InfiniteData } from "@tanstack/svelte-query";
import type { TRPCRequestOptions } from "@trpc/client";

export type WithRequired<TObj, TKey extends keyof TObj> = TObj & {
  [P in TKey]-?: TObj[P];
};

export type MaybePromise<T> = Promise<T> | T;

export type DistributiveOmit<
  TObj,
  TKey extends PropertyKey,
> = TObj extends unknown ? Omit<TObj, TKey> : never;

export type CoerceAsyncIterableToArray<T> =
  T extends AsyncIterable<infer U> ? Array<U> : T;

export type InferAsyncIterableYield<T> =
  T extends AsyncIterable<infer U> ? U : T;

export type ResolverDef = {
  input: unknown;
  output: unknown;
  transformer: boolean;
  errorShape: unknown;
  featureFlags: FeatureFlags;
};

type CursorInput = { cursor?: unknown };

/**
An input that may have a `cursor`, as used by infinite queries.
*/
export type OptionalCursorInput = CursorInput | void;

export type ExtractCursorType<TInput> = TInput extends CursorInput
  ? TInput["cursor"]
  : unknown;

export type TRPCInfiniteData<TInput, TOutput> = InfiniteData<
  TOutput,
  NonNullable<ExtractCursorType<TInput>> | null
>;

/**
tRPC options for a single query or mutation, passed as `trpc`.
*/
export interface TRPCSvelteRequestOptions extends Omit<
  TRPCRequestOptions,
  "signal"
> {
  /**
  Abort the request with the query's signal, for example when every observer of the query is destroyed.
  */
  abortOnUnmount?: boolean;
}

/**
Adds the `trpc` option to TanStack Query options.
*/
export interface TRPCQueryBaseOptions {
  /**
  tRPC options for the request.
  */
  trpc?: TRPCSvelteRequestOptions;
}

/**
Extra fields that tRPC adds to the options it returns.
*/
export interface TRPCQueryOptionsResult {
  trpc: {
    /**
    The dot-separated procedure path, such as `post.byId`.
    */
    path: string;
  };
}

/**
The kind of query a key matches. `any` matches both.
*/
export type QueryType = "any" | "infinite" | "query";

/**
A tRPC query key: the procedure path, then the input and query type.
*/
export type TRPCQueryKeyWithoutPrefix = [
  path: Array<string>,
  opts?: { input?: unknown; type?: Exclude<QueryType, "any"> },
];

/**
A tRPC query key that starts with a key prefix.
*/
export type TRPCQueryKeyWithPrefix = [
  prefix: Array<string>,
  ...key: TRPCQueryKeyWithoutPrefix,
];

/**
A tRPC query key, with a prefix if `TPrefixEnabled` is `true`.
*/
export type TRPCQueryKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCQueryKeyWithPrefix
    : TRPCQueryKeyWithoutPrefix;

/**
Any tRPC query key, with or without a prefix.
*/
export type AnyTRPCQueryKey =
  | TRPCQueryKeyWithoutPrefix
  | TRPCQueryKeyWithPrefix;

/**
A tRPC mutation key: the procedure path.
*/
export type TRPCMutationKeyWithoutPrefix = [path: Array<string>];

/**
A tRPC mutation key that starts with a key prefix.
*/
export type TRPCMutationKeyWithPrefix = [
  prefix: Array<string>,
  ...key: TRPCMutationKeyWithoutPrefix,
];

/**
Any tRPC mutation key, with or without a prefix.
*/
export type AnyTRPCMutationKey =
  | TRPCMutationKeyWithoutPrefix
  | TRPCMutationKeyWithPrefix;

/**
A tRPC mutation key, with a prefix if `TPrefixEnabled` is `true`.
*/
export type TRPCMutationKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCMutationKeyWithPrefix
    : TRPCMutationKeyWithoutPrefix;

/**
Feature flags for configuring tRPC behavior.
*/
export type FeatureFlags = {
  /**
  Whether query and mutation keys start with a prefix.
  */
  keyPrefix: boolean;
};

export type OfFeatureFlags<T extends FeatureFlags> = T;

export type KeyPrefixOptions<TFeatureFlags extends FeatureFlags> =
  TFeatureFlags["keyPrefix"] extends true
    ? { keyPrefix: string }
    : {
        /**
        Enable the `keyPrefix` feature flag to use a query key prefix.
        */
        keyPrefix?: never;
      };

/**
Default feature flags, with the query key prefix disabled.
*/
export type DefaultFeatureFlags = OfFeatureFlags<{ keyPrefix: false }>;
