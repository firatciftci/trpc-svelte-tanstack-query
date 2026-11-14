import type { QueryClient } from "@tanstack/svelte-query";
import type { TRPCClient } from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import { useQueryClient } from "@tanstack/svelte-query";
import { getContext, hasContext, setContext } from "svelte";
import type { TRPCOptionsProxy } from "#lib/internals/create-options-proxy.js";
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  KeyPrefixOptions,
} from "#lib/internals/types.js";
import { createOptionsProxy } from "#lib/internals/create-options-proxy.js";

/**
Options for `setTRPCContext`.
*/
export type SetTRPCContextOptions<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = {
  /**
  The tRPC client to call procedures with.
  */
  trpcClient: TRPCClient<TRouter>;
  /**
  The `QueryClient` to use. Defaults to the one from `QueryClientProvider` above the calling component.
  */
  queryClient?: QueryClient;
} & KeyPrefixOptions<TFeatureFlags>;

/**
What `createTRPCContext` returns.
*/
export interface CreateTRPCContextResult<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> {
  /**
  Makes the tRPC client and options proxy available to `useTRPC` and `useTRPCClient` in the calling component and
  its descendants. Call it during component initialization, usually in the root `+layout.svelte`. Returns the
  options proxy.
  */
  setTRPCContext: (
    opts: SetTRPCContextOptions<TRouter, TFeatureFlags>,
  ) => TRPCOptionsProxy<TRouter, TFeatureFlags>;
  /**
  Returns the options proxy for your router. Call it during component initialization.
  */
  useTRPC: () => TRPCOptionsProxy<TRouter, TFeatureFlags>;
  /**
  Returns the tRPC client, for calling procedures directly. Call it during component initialization.
  */
  useTRPCClient: () => TRPCClient<TRouter>;
}

/**
Creates the `setTRPCContext`, `useTRPC`, and `useTRPCClient` functions for your router.

@example
```ts
export const { setTRPCContext, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
```
*/
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(): CreateTRPCContextResult<TRouter, TFeatureFlags> {
  type Context = {
    client: TRPCClient<TRouter>;
    proxy: TRPCOptionsProxy<TRouter, TFeatureFlags>;
  };

  const key = Symbol("trpc-svelte-tanstack-query");

  function read(caller: string): Context {
    if (!hasContext(key)) {
      throw new Error(
        `${caller} can only be called in a component whose ancestor, or itself, called setTRPCContext() from the same createTRPCContext()`,
      );
    }
    return getContext<Context>(key);
  }

  function setTRPCContext(
    opts: SetTRPCContextOptions<TRouter, TFeatureFlags>,
  ): TRPCOptionsProxy<TRouter, TFeatureFlags> {
    const keyPrefix: string | undefined = opts.keyPrefix;
    const proxy = createOptionsProxy<TRouter>({
      client: opts.trpcClient,
      queryClient: opts.queryClient ?? useQueryClient(),
      keyPrefix,
    }) as TRPCOptionsProxy<TRouter, TFeatureFlags>;
    setContext<Context>(key, { client: opts.trpcClient, proxy });
    return proxy;
  }

  return {
    setTRPCContext,
    useTRPC: () => read("useTRPC()").proxy,
    useTRPCClient: () => read("useTRPCClient()").client,
  };
}
