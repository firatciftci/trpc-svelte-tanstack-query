import type { AnyTRPCRouter } from "@trpc/server";
import { QueryClient } from "@tanstack/svelte-query";
import { createTRPCClient, localLink } from "@trpc/client";
import type { FeatureFlags } from "#lib/index.js";
import { createTRPCContext, createTRPCOptionsProxy } from "#lib/index.js";

type Flags<TKeyPrefix extends string | undefined> = undefined extends TKeyPrefix
  ? { keyPrefix: false }
  : { keyPrefix: true };

export function createLocalResource<
  TRouter extends AnyTRPCRouter,
  TKeyPrefix extends string | undefined = undefined,
>(
  router: TRouter,
  opts?: { keyPrefix?: TKeyPrefix; queryClient?: QueryClient },
) {
  const client = createTRPCClient<TRouter>({
    links: [localLink({ router, createContext: async () => ({}) } as never)],
  });
  const queryClient =
    opts?.queryClient ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const keyPrefix = opts?.keyPrefix as never;
  const context = createTRPCContext<
    TRouter,
    Flags<TKeyPrefix> & FeatureFlags
  >();
  const optionsProxy = createTRPCOptionsProxy<
    TRouter,
    Flags<TKeyPrefix> & FeatureFlags
  >({ client, queryClient, keyPrefix });

  return {
    router,
    client,
    queryClient,
    keyPrefix: opts?.keyPrefix,
    optionsProxy,
    ...context,
    [Symbol.dispose]() {
      queryClient.clear();
    },
  };
}
