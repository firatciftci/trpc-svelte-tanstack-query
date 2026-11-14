export type {
  CreateTRPCContextResult,
  SetTRPCContextOptions,
} from "#lib/internals/context.js";
export { createTRPCContext } from "#lib/internals/context.js";
export type {
  DecorateInfiniteQueryProcedure,
  DecorateMutationProcedure,
  DecorateProcedure,
  DecorateQueryProcedure,
  DecorateRouterKeyable,
  DecorateSubscriptionProcedure,
  inferInput,
  inferOutput,
  TRPCOptionsProxy,
  TRPCOptionsProxyOptions,
} from "#lib/internals/create-options-proxy.js";
export { createTRPCOptionsProxy } from "#lib/internals/create-options-proxy.js";
export { createSubscription } from "#lib/internals/create-subscription.svelte.js";
export { dehydrateUnsent } from "#lib/internals/hydration.js";
export type { TRPCInfiniteQueryOptions } from "#lib/internals/infinite-query-options.js";
export type { TRPCMutationOptions } from "#lib/internals/mutation-options.js";
export type { TRPCQueryOptions } from "#lib/internals/query-options.js";
export type {
  TRPCConnectionState,
  TRPCSubscriptionConnectingResult,
  TRPCSubscriptionErrorResult,
  TRPCSubscriptionIdleResult,
  TRPCSubscriptionOptions,
  TRPCSubscriptionOptionsOut,
  TRPCSubscriptionPendingResult,
  TRPCSubscriptionResult,
  TRPCSubscriptionStatus,
} from "#lib/internals/subscription-options.js";
export type {
  AnyTRPCMutationKey,
  AnyTRPCQueryKey,
  DefaultFeatureFlags,
  ExtractCursorType,
  FeatureFlags,
  KeyPrefixOptions,
  OptionalCursorInput,
  QueryType,
  ResolverDef,
  TRPCInfiniteData,
  TRPCMutationKey,
  TRPCMutationKeyWithoutPrefix,
  TRPCMutationKeyWithPrefix,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
  TRPCQueryKeyWithoutPrefix,
  TRPCQueryKeyWithPrefix,
  TRPCQueryOptionsResult,
  TRPCSvelteRequestOptions,
} from "#lib/internals/types.js";
