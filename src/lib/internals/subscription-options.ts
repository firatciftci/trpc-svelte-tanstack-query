import type { SkipToken } from "@tanstack/svelte-query";
import type { TRPCClientErrorLike, TRPCUntypedClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import type { Unsubscribable } from "@trpc/server/observable";
import { skipToken } from "@tanstack/svelte-query";
import type {
  FeatureFlags,
  InferAsyncIterableYield,
  ResolverDef,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from "#lib/internals/types.js";
import { createTRPCOptionsResult } from "#lib/internals/utils.js";

/**
The state of the connection behind a subscription, as reported by links such as `httpSubscriptionLink` and `wsLink`.
*/
export type TRPCConnectionState<TError> =
  | { type: "state"; state: "idle"; error: null }
  | { type: "state"; state: "connecting"; error: TError | null }
  | { type: "state"; state: "pending"; error: null };

interface SubscriptionCallbacks<TOutput, TError> {
  onStarted?: () => void;
  onData?: (data: InferAsyncIterableYield<TOutput>) => void;
  onError?: (err: TError) => void;
  onStopped?: () => void;
  /**
  Called when the server completes the subscription. The status moves to `idle` with `data: undefined`.
  */
  onComplete?: () => void;
  onConnectionStateChange?: (state: TRPCConnectionState<TError>) => void;
}

interface BaseTRPCSubscriptionOptionsIn<
  TOutput,
  TError,
> extends SubscriptionCallbacks<TOutput, TError> {
  enabled?: boolean;
}

/**
What a `subscriptionOptions` helper returns, for `createSubscription`.
*/
export interface TRPCSubscriptionOptionsOut<
  TOutput,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends SubscriptionCallbacks<TOutput, TError>, TRPCQueryOptionsResult {
  enabled: boolean;
  queryKey: TRPCQueryKey<TFeatureFlags["keyPrefix"]>;
  subscribe: (
    innerOpts: SubscriptionCallbacks<TOutput, TError>,
  ) => Unsubscribable;
}

/**
The `subscriptionOptions` helper on a subscription procedure. Returns options for `createSubscription`.
*/
export interface TRPCSubscriptionOptions<
  TDef extends ResolverDef,
  TFeatureFlags extends FeatureFlags = TDef["featureFlags"],
> {
  (
    input: TDef["input"],
    opts?: SubscriptionCallbacks<
      InferAsyncIterableYield<TDef["output"]>,
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<
    InferAsyncIterableYield<TDef["output"]>,
    TRPCClientErrorLike<TDef>,
    TFeatureFlags
  >;
  (
    input: TDef["input"] | SkipToken,
    opts?: BaseTRPCSubscriptionOptionsIn<
      InferAsyncIterableYield<TDef["output"]>,
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<
    InferAsyncIterableYield<TDef["output"]>,
    TRPCClientErrorLike<TDef>,
    TFeatureFlags
  >;
}

/**
The status of a subscription.
*/
export type TRPCSubscriptionStatus =
  | "idle"
  | "connecting"
  | "pending"
  | "error";

/**
Fields shared by every `createSubscription` result.
*/
export interface TRPCSubscriptionBaseResult<TOutput, TError> {
  /**
  Where the subscription is in its lifecycle.
  */
  status: TRPCSubscriptionStatus;
  /**
  The last data received.
  */
  data: undefined | TOutput;
  /**
  The last error, if any.
  */
  error: null | TError;
  /**
  Unsubscribe, reset the state, and subscribe again if enabled.
  */
  reset: () => void;
}

/**
Result while the subscription is not running.
*/
export interface TRPCSubscriptionIdleResult<
  TOutput,
> extends TRPCSubscriptionBaseResult<TOutput, null> {
  status: "idle";
  data: undefined;
  error: null;
}

/**
Result while connecting or reconnecting.
*/
export interface TRPCSubscriptionConnectingResult<
  TOutput,
  TError,
> extends TRPCSubscriptionBaseResult<TOutput, TError> {
  status: "connecting";
  data: undefined | TOutput;
  error: TError | null;
}

/**
Result while connected and waiting for data.
*/
export interface TRPCSubscriptionPendingResult<
  TOutput,
> extends TRPCSubscriptionBaseResult<TOutput, undefined> {
  status: "pending";
  data: TOutput | undefined;
  error: null;
}

/**
Result after an error that stopped the subscription.
*/
export interface TRPCSubscriptionErrorResult<
  TOutput,
  TError,
> extends TRPCSubscriptionBaseResult<TOutput, TError> {
  status: "error";
  data: TOutput | undefined;
  error: TError;
}

/**
The result of `createSubscription`. Check `status` to narrow it.
*/
export type TRPCSubscriptionResult<TOutput, TError> =
  | TRPCSubscriptionIdleResult<TOutput>
  | TRPCSubscriptionConnectingResult<TOutput, TError>
  | TRPCSubscriptionErrorResult<TOutput, TError>
  | TRPCSubscriptionPendingResult<TOutput>;

export function trpcSubscriptionOptions<
  TFeatureFlags extends FeatureFlags,
>(args: {
  subscribe: TRPCUntypedClient<AnyTRPCRouter>["subscription"];
  path: Array<string>;
  queryKey: TRPCQueryKey<TFeatureFlags["keyPrefix"]>;
  input: unknown;
  opts: BaseTRPCSubscriptionOptionsIn<unknown, unknown> | undefined;
}): TRPCSubscriptionOptionsOut<unknown, unknown, TFeatureFlags> {
  const { subscribe, path, queryKey, input, opts = {} } = args;
  const isEnabled =
    "enabled" in opts ? Boolean(opts.enabled) : input !== skipToken;

  return {
    ...opts,
    enabled: isEnabled,
    subscribe: (innerOpts) =>
      subscribe(path.join("."), input === skipToken ? undefined : input, {
        ...innerOpts,
        onComplete: () => innerOpts.onComplete?.(),
      }),
    queryKey,
    trpc: createTRPCOptionsResult({ path }),
  };
}
