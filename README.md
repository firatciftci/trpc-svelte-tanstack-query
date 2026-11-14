<div align="center">

<h1>trpc-svelte-tanstack-query</h1>

<p><strong>End-to-end type-safe TanStack Query options for every tRPC procedure, built for Svelte 5 and SvelteKit.</strong></p>

<p>
<a href="https://www.npmjs.com/package/trpc-svelte-tanstack-query"><img src="https://img.shields.io/npm/v/trpc-svelte-tanstack-query?style=flat&colorA=18181b&colorB=ff3e00" alt="npm version"></a>
<a href="https://github.com/firatciftci/trpc-svelte-tanstack-query/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/firatciftci/trpc-svelte-tanstack-query/ci.yml?branch=main&style=flat&colorA=18181b&label=CI" alt="CI status"></a>
<a href="https://www.npmjs.com/package/trpc-svelte-tanstack-query"><img src="https://img.shields.io/npm/types/trpc-svelte-tanstack-query?style=flat&colorA=18181b&colorB=3178c6" alt="TypeScript types included"></a>
<a href="./LICENSE"><img src="https://img.shields.io/github/license/firatciftci/trpc-svelte-tanstack-query?style=flat&colorA=18181b&colorB=ff3e00" alt="MIT license"></a>
</p>

<p>
<a href="#quick-start">Quick start</a>
·
<a href="#usage">Usage</a>
·
<a href="#sveltekit-server-rendering">SvelteKit</a>
·
<a href="#api-reference">API reference</a>
·
<a href="#coming-from-react">Coming from React</a>
</p>

</div>

```svelte
<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "$lib/trpc";

  let { id }: { id: string } = $props();

  const trpc = useTRPC();
  const post = createQuery(() => trpc.post.byId.queryOptions({ id }));
</script>

{#if post.isSuccess}
  <h1>{post.data.title}</h1>
{/if}
```

`post.data` is typed from your router, the query refetches when `id` changes, and the query key is generated for you. There are no wrapper hooks to learn: you hand tRPC's options straight to TanStack Svelte Query.

## Why this package

tRPC's official [`@trpc/tanstack-react-query`](https://trpc.io/docs/client/tanstack-react-query/setup) moved away from wrapped hooks to option factories. Each procedure gives you `queryOptions`, `mutationOptions`, and friends, and you pass them to TanStack Query yourself. That design suits Svelte even better than React, because TanStack Svelte Query 6 takes options as functions and tracks runes inside them.

This package is a faithful port of that design for Svelte. It follows the React package's API and behavior closely, adds what Svelte and SvelteKit need, and is tested against the same cases.

- Every TanStack Query feature, fully typed. Queries, infinite queries, mutations, and subscriptions infer input, output, and error types from your router.
- Cache helpers for any path. Query keys and filters for every procedure and router, for invalidation, `setQueryData`, and `getQueryData`.
- Rune-based subscriptions. `createSubscription` follows its input reactively and exposes a narrowed status union.
- Streaming. Procedures that return async iterables stream into the cache through TanStack Query's `streamedQuery`.
- Built for SvelteKit. Prefetch in universal or server `load` functions, call your router directly on the server, and stream pending queries to the browser with `dehydrateUnsent` and `HydrationBoundary`.
- Several clients, one cache. Optional query key prefixes keep several tRPC clients apart in one `QueryClient`.
- Experimental handles. The `unstable-handles` entry point ports tRPC's serializable query handles for passing prefetched queries from `load` functions to components.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Usage](#usage): [queries](#queries), [mutations](#mutations), [infinite queries](#infinite-queries), [query keys and filters](#query-keys-and-filters), [subscriptions](#subscriptions), [request options](#request-options), [inferring types](#inferring-types), [query key prefixes](#query-key-prefixes)
- [SvelteKit server rendering](#sveltekit-server-rendering)
- [Handles (experimental)](#handles-experimental)
- [API reference](#api-reference)
- [Coming from React](#coming-from-react)
- [Compatibility](#compatibility)

## Install

```sh
npm install trpc-svelte-tanstack-query @tanstack/svelte-query @trpc/client @trpc/server
```

Or with `pnpm add`, `yarn add`, or `bun add`. You need Svelte 5, TanStack Svelte Query 6.3.11 or later, and tRPC 11.28 or later. See [Compatibility](#compatibility).

## Quick start

**1. Create the context functions for your router**, once:

```ts
// src/lib/trpc.ts
import type { AppRouter } from "$lib/server/router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "trpc-svelte-tanstack-query";

export const { setTRPCContext, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export function createClient(fetch?: typeof globalThis.fetch) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/api/trpc", fetch })],
  });
}
```

**2. Provide it in your root layout**, next to `QueryClientProvider`:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { browser } from "$app/env";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { createClient, setTRPCContext } from "$lib/trpc";

  let { children } = $props();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: browser, staleTime: 60_000 } },
  });

  setTRPCContext({ trpcClient: createClient(), queryClient });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
```

**3. Use it in any component** below the layout:

```svelte
<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "$lib/trpc";

  const trpc = useTRPC();
  const greeting = createQuery(() => trpc.greeting.queryOptions({ name: "Svelte" }));
</script>

<p>{greeting.data ?? "Loading…"}</p>
```

`setTRPCContext` returns the same options proxy that `useTRPC()` does. If you leave out `queryClient`, it uses the one from a `QueryClientProvider` above the calling component.

## Usage

### Queries

```svelte
<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "$lib/trpc";

  let { id }: { id: string } = $props();

  const trpc = useTRPC();
  const post = createQuery(() => trpc.post.byId.queryOptions({ id }));
</script>

{#if post.isPending}
  <p>Loading…</p>
{:else if post.isError}
  <p>{post.error.message}</p>
{:else}
  <h1>{post.data.title}</h1>
{/if}
```

Because `createQuery` takes a function, the query follows `id` when it changes. Every TanStack Query option works as the second argument, with tRPC's types:

```ts
const titles = createQuery(() =>
  trpc.post.list.queryOptions(undefined, {
    select: (posts) => posts.map((post) => post.title),
    staleTime: 30_000,
  }),
);
```

Pass `skipToken` from `@tanstack/svelte-query` as the input to turn a query off until its input is ready:

```ts
const user = createQuery(() =>
  trpc.user.byId.queryOptions(userId == null ? skipToken : { id: userId }),
);
```

A procedure that returns an async iterable is streamed into the query: `data` grows into an array as values arrive, and `fetchStatus` stays `fetching` until the stream ends.

The same options work anywhere TanStack Query takes them, such as `queryClient.fetchQuery`, `queryClient.prefetchQuery`, or `createQueries`.

### Mutations

```svelte
<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { useTRPC } from "$lib/trpc";

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createPost = createMutation(() =>
    trpc.post.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.post.pathFilter()),
    }),
  );
</script>

<button onclick={() => createPost.mutate({ title: "Hello" })} disabled={createPost.isPending}>
  Create post
</button>
```

Query keys carry their data type, so optimistic updates are typed end to end:

```ts
const renamePost = createMutation(() =>
  trpc.post.rename.mutationOptions({
    onMutate: async ({ id, title }) => {
      const key = trpc.post.byId.queryKey({ id });
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (post) => post && { ...post, title });
      return { previous };
    },
    onError: (_error, { id }, result) => {
      queryClient.setQueryData(
        trpc.post.byId.queryKey({ id }),
        result?.previous,
      );
    },
    onSettled: (_data, _error, { id }) =>
      queryClient.invalidateQueries(trpc.post.byId.queryFilter({ id })),
  }),
);
```

### Infinite queries

Procedures whose input has a `cursor` also get `infiniteQueryOptions`. The cursor is filled in for you, so leave it out of the input:

```svelte
<script lang="ts">
  import { createInfiniteQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "$lib/trpc";

  const trpc = useTRPC();
  const posts = createInfiniteQuery(() =>
    trpc.post.infinite.infiniteQueryOptions(
      { limit: 10 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor },
    ),
  );
</script>

{#each posts.data?.pages ?? [] as page}
  {#each page.items as post (post.id)}
    <p>{post.title}</p>
  {/each}
{/each}

<button
  onclick={() => posts.fetchNextPage()}
  disabled={!posts.hasNextPage || posts.isFetchingNextPage}
>
  Load more
</button>
```

Pass `initialCursor` in the options to start somewhere other than the first page.

### Query keys and filters

Every procedure and router path has helpers for working with the cache:

```ts
trpc.post.pathKey(); // every query under `post`
trpc.post.pathFilter(); // the same, as a filter for invalidateQueries and friends
trpc.post.byId.queryKey({ id: "1" });
trpc.post.byId.queryFilter({ id: "1" });
trpc.post.infinite.infiniteQueryKey({ limit: 10 });
trpc.post.create.mutationKey();

queryClient.setQueryData(
  trpc.post.byId.queryKey({ id: "1" }),
  (post) => post && { ...post, title: "New title" },
);
```

Keys carry their data type, so `getQueryData` and `setQueryData` are typed too. Inputs to `queryKey` and `queryFilter` are partial, so `trpc.post.byId.queryFilter()` matches every `byId` query.

### Subscriptions

```svelte
<script lang="ts">
  import { createSubscription } from "trpc-svelte-tanstack-query";
  import { useTRPC } from "$lib/trpc";

  let { roomId }: { roomId: string } = $props();

  const trpc = useTRPC();
  const messages = createSubscription(() =>
    trpc.chat.onMessage.subscriptionOptions({ roomId }, { onData: (message) => console.log(message) }),
  );
</script>

<p>Status: {messages.status}</p>
{#if messages.data}
  <p>{messages.data.text}</p>
{/if}
```

The subscription starts once the component mounts and stops when it's destroyed. It restarts when the input changes or `enabled` turns on, and it goes back to `idle` when `enabled` turns off or the input is `skipToken`. Callbacks always see the latest options without restarting the subscription.

| `status`     | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `idle`       | Not running: disabled, skipped, or completed by the server          |
| `connecting` | Connecting or reconnecting; `error` holds the last connection error |
| `pending`    | Connected and receiving data                                        |
| `error`      | Stopped by an error; call `reset()` to try again                    |

`data` holds the last value received. `reset()` unsubscribes, clears the state, and subscribes again if the subscription is enabled. Narrow on `status` and TypeScript knows which fields are set.

### Request options

Pass tRPC request options as `trpc`, next to the TanStack Query options:

```ts
trpc.post.byId.queryOptions(
  { id },
  { trpc: { context: { skipBatch: true }, abortOnUnmount: true } },
);
```

`context` goes to your links. `abortOnUnmount` aborts the request with the query's signal, for example when every component using the query is destroyed. Use `useTRPCClient()` for one-off calls outside of TanStack Query.

### Inferring types

```ts
import type { inferInput, inferOutput } from "trpc-svelte-tanstack-query";

type PostInput = inferInput<typeof trpc.post.byId>;
type Post = inferOutput<typeof trpc.post.byId>;
```

### Query key prefixes

To use several tRPC clients with one `QueryClient`, turn on the `keyPrefix` feature flag and give each context a prefix:

```ts
export const billing = createTRPCContext<BillingRouter, { keyPrefix: true }>();

billing.setTRPCContext({ trpcClient, queryClient, keyPrefix: "billing" });
```

Keys and filters from that context start with the prefix, and their types say so.

## SvelteKit server rendering

`createTRPCOptionsProxy` builds the same options proxy without Svelte context, so you can use it in `load` functions and hooks. Pick the approach that fits where your data comes from:

|                         | Universal `load` (`+page.ts`)       | Server `load` (`+page.server.ts`)                |
| ----------------------- | ----------------------------------- | ------------------------------------------------ |
| Calls procedures        | Over HTTP, with SvelteKit's `fetch` | Directly on your router, with no HTTP round trip |
| Runs on navigation      | In the browser                      | On the server                                    |
| Streams pending queries | No                                  | Yes, with `dehydrateUnsent`                      |

### Prefetching in a universal load

Create the `QueryClient` in your root `+layout.ts` instead of the layout component, so `load` functions can reach it:

```ts
// src/routes/+layout.ts
import { browser } from "$app/env";
import { QueryClient } from "@tanstack/svelte-query";

export const load = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: browser, staleTime: 60_000 } },
  });
  return { queryClient };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import { untrack } from "svelte";
  import { createClient, setTRPCContext } from "$lib/trpc";

  let { data, children } = $props();

  untrack(() => setTRPCContext({ trpcClient: createClient(), queryClient: data.queryClient }));
</script>

<QueryClientProvider client={data.queryClient}>
  {@render children()}
</QueryClientProvider>
```

`untrack` tells Svelte you mean to read `data` once, when the layout is created; the `QueryClient` never changes.

Then prefetch with a client built on SvelteKit's `fetch`, so the response is inlined into the page and not requested again while hydrating:

```ts
// src/routes/posts/[id]/+page.ts
import { createTRPCOptionsProxy } from "trpc-svelte-tanstack-query";
import { createClient } from "$lib/trpc";

export const load = async ({ fetch, parent, params }) => {
  const { queryClient } = await parent();
  const trpc = createTRPCOptionsProxy({
    client: createClient(fetch),
    queryClient,
  });
  await queryClient.prefetchQuery(
    trpc.post.byId.queryOptions({ id: params.id }),
  );
};
```

The page reads it with the same `createQuery(() => trpc.post.byId.queryOptions({ id }))` as before.

### Prefetching in a server load

A server `load` can call your router directly. Create a `QueryClient` and a router-based proxy for each request in `hooks.server.ts`, and let pending queries be dehydrated so they can stream:

```ts
// src/hooks.server.ts
import type { Handle } from "@sveltejs/kit/hooks";
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/svelte-query";
import { createTRPCOptionsProxy } from "trpc-svelte-tanstack-query";
import { createContext } from "$lib/server/context";
import { appRouter } from "$lib/server/router";

export const handle: Handle = async ({ event, resolve }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
  event.locals.queryClient = queryClient;
  event.locals.trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: () => createContext(event),
    queryClient,
  });
  return resolve(event);
};
```

<details>
<summary>Typing <code>event.locals</code></summary>

```ts
// src/app.d.ts
import type { QueryClient } from "@tanstack/svelte-query";
import type { TRPCOptionsProxy } from "trpc-svelte-tanstack-query";
import type { AppRouter } from "$lib/server/router";

declare global {
  namespace App {
    interface Locals {
      queryClient: QueryClient;
      trpc: TRPCOptionsProxy<AppRouter>;
    }
  }
}

export {};
```

</details>

Return `dehydrateUnsent(queryClient)` from the `load` function, and render the page inside `HydrationBoundary`:

```ts
// src/routes/posts/[id]/+page.server.ts
import { dehydrateUnsent } from "trpc-svelte-tanstack-query";

export const load = async ({ locals: { queryClient, trpc }, params }) => {
  await queryClient.prefetchQuery(
    trpc.post.byId.queryOptions({ id: params.id }),
  );
  void queryClient.prefetchQuery(
    trpc.post.comments.queryOptions({ id: params.id }),
  );
  return { id: params.id, dehydratedState: dehydrateUnsent(queryClient) };
};
```

```svelte
<!-- src/routes/posts/[id]/+page.svelte -->
<script lang="ts">
  import { HydrationBoundary } from "@tanstack/svelte-query";
  import Post from "./post.svelte";

  let { data } = $props();
</script>

<HydrationBoundary state={data.dehydratedState}>
  <Post id={data.id} />
</HydrationBoundary>
```

The awaited query is in the server-rendered HTML. The comments query isn't awaited, so it's sent as a pending promise that SvelteKit streams to the browser, where it fills the cache without a second request.

`dehydrateUnsent` skips anything an earlier call already sent for the same `QueryClient`. When a layout and a page both prefetch and both return `dehydrateUnsent(queryClient)`, each one sends only what it added.

Server-rendered data goes through SvelteKit's serializer, which already handles `Date`, `Map`, `Set`, and other built-in types, so you don't need a transformer for this path.

## Handles (experimental)

`trpc-svelte-tanstack-query/unstable-handles` is a port of tRPC's experimental handles. `loadHandles` starts several queries at once in a `load` function and returns small, serializable handles that you pass to components, which read them with `fromHandle`:

```ts
// src/routes/posts/[id]/+page.server.ts
import { error } from "@sveltejs/kit";
import { dehydrateUnsent } from "trpc-svelte-tanstack-query";
import {
  ensureEntry,
  isTRPCEntryError,
  loadHandles,
  prefetchInfiniteEntry,
} from "trpc-svelte-tanstack-query/unstable-handles";

export const load = async ({ locals: { queryClient, trpc }, params }) => {
  const [handles] = await loadHandles(trpc, {
    post: ensureEntry(trpc.post.byId, { id: params.id }),
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: params.id }),
  }).catch((cause: unknown) => {
    if (isTRPCEntryError(cause, trpc.post.byId) && cause.code === "NOT_FOUND") {
      error(404, "Post not found");
    }
    throw cause;
  });
  return { handles, dehydratedState: dehydrateUnsent(queryClient) };
};
```

```svelte
<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { fromHandle } from "trpc-svelte-tanstack-query/unstable-handles";
  import { useTRPC } from "$lib/trpc";

  let { data } = $props();

  const trpc = useTRPC();
  const post = createQuery(() => fromHandle(trpc, data.handles.post));
</script>
```

`prefetchEntry`, `fetchEntry`, and `ensureEntry` match the `QueryClient` methods they're named after, and each has an infinite query version. `loadHandlesSettled` returns errors as values instead of rejecting. This API may change in any release, as it can in tRPC.

## API reference

### `trpc-svelte-tanstack-query`

| Export                                                     | Description                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createTRPCContext<TRouter, TFeatureFlags?>()`             | Returns `setTRPCContext`, `useTRPC`, and `useTRPCClient` for your router.                                                                                                                                    |
| `setTRPCContext({ trpcClient, queryClient?, keyPrefix? })` | Provides the client to child components and returns the options proxy. Call it during component initialization.                                                                                              |
| `useTRPC()`                                                | Returns the options proxy from context.                                                                                                                                                                      |
| `useTRPCClient()`                                          | Returns the tRPC client from context.                                                                                                                                                                        |
| `createTRPCOptionsProxy(options)`                          | Builds the options proxy without context. Pass `{ client, queryClient }` to call through a tRPC client, or `{ router, ctx, queryClient }` to call a router directly. Also takes `keyPrefix` and `overrides`. |
| `createSubscription(() => options)`                        | Runs a subscription for the lifetime of the calling component and returns its reactive state.                                                                                                                |
| `dehydrateUnsent(queryClient)`                             | Dehydrates the queries and mutations that earlier calls haven't sent yet.                                                                                                                                    |

### Procedure and router helpers

| Helper                                  | Available on                       | Returns                                                             |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `queryOptions(input, options?)`         | Queries                            | Options for `createQuery`, `fetchQuery`, `prefetchQuery`, and so on |
| `queryKey(input?)`                      | Queries                            | The query key, tagged with the data type                            |
| `queryFilter(input?, filters?)`         | Queries                            | A query filter for this procedure                                   |
| `infiniteQueryOptions(input, options)`  | Queries whose input has a `cursor` | Options for `createInfiniteQuery` and `prefetchInfiniteQuery`       |
| `infiniteQueryKey(input?)`              | Queries whose input has a `cursor` | The infinite query key                                              |
| `infiniteQueryFilter(input?, filters?)` | Queries whose input has a `cursor` | A filter for this procedure's infinite queries                      |
| `mutationOptions(options?)`             | Mutations                          | Options for `createMutation`                                        |
| `mutationKey()`                         | Mutations                          | The mutation key                                                    |
| `subscriptionOptions(input, options?)`  | Subscriptions                      | Options for `createSubscription`                                    |
| `pathKey()`                             | Routers and queries                | A key that matches every query at or below this path                |
| `pathFilter(filters?)`                  | Routers and queries                | The same, as a query filter                                         |

<details>
<summary>Running code after every mutation</summary>

`createTRPCOptionsProxy` takes an `overrides.mutations.onSuccess` hook that wraps every mutation's `onSuccess`. Use it to invalidate the whole cache after any mutation:

```ts
const trpc = createTRPCOptionsProxy<AppRouter>({
  client,
  queryClient,
  overrides: {
    mutations: {
      onSuccess: async ({ originalFn, queryClient }) => {
        await originalFn();
        await queryClient.invalidateQueries();
      },
    },
  },
});
```

</details>

### `trpc-svelte-tanstack-query/unstable-handles`

| Export                                                               | Description                                                                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `loadHandles(trpc, entries)`                                         | Starts every entry at once and resolves to `[handles, data]`. Rejects with a `TRPCEntryError` as soon as a fetch or ensure entry fails. |
| `loadHandlesSettled(trpc, entries)`                                  | Like `loadHandles`, but returns each entry's error as a value.                                                                          |
| `prefetchEntry`, `fetchEntry`, `ensureEntry`                         | Describe a query to load, matching the `QueryClient` method of the same name.                                                           |
| `prefetchInfiniteEntry`, `fetchInfiniteEntry`, `ensureInfiniteEntry` | The same for infinite queries.                                                                                                          |
| `fromHandle(trpc, handle, options?)`                                 | Turns a handle back into query options for `createQuery`, or for `createInfiniteQuery` when you pass `getNextPageParam` in the options. |
| `isTRPCEntryError(error, procedure?)`                                | Checks whether an error came from an entry, optionally from a given procedure, and narrows its type.                                    |

Every type is exported too, including `TRPCOptionsProxy`, `TRPCQueryKey`, `TRPCSubscriptionResult`, and the `Decorate*` helper types.

## Coming from React

If you know `@trpc/tanstack-react-query`, these are the differences:

- `createTRPCContext` returns `setTRPCContext`, `useTRPC`, and `useTRPCClient`. Svelte has no provider components for this, so you call `setTRPCContext` during component initialization.
- `useSubscription` is `createSubscription`, and it takes a function that returns the options, like `createQuery`. Turning `enabled` off resets the subscription to `idle`.
- `unstable_createHydrateClient` is replaced by `dehydrateUnsent` and Svelte Query's `HydrationBoundary`, which work with SvelteKit `load` functions.
- There are no suspense variants, because Svelte Query has none.
- The `ssr` request option is gone, since it had no effect.
- `queryOptions`, `mutationOptions`, and `subscriptionOptions` use the feature flags of the context they come from, so query keys from a prefixed context are typed as prefixed.

Everything else, including option names, query keys, and cache behavior, matches the React package, so its [documentation](https://trpc.io/docs/client/tanstack-react-query/usage) applies here too.

## Compatibility

| Package                        | Supported versions |
| ------------------------------ | ------------------ |
| `svelte`                       | `^5.25.0`          |
| `@tanstack/svelte-query`       | `^6.3.11`          |
| `@trpc/client`, `@trpc/server` | `^11.28.0`         |
| `typescript` (optional)        | `>=5.7.2`          |

The package ships ES modules only. CI runs the test suite against the latest versions and against the lowest supported versions of tRPC and TanStack Svelte Query.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) to get set up, and [SECURITY.md](./SECURITY.md) to report a vulnerability privately.

## License

[MIT](./LICENSE). Much of this package is adapted from [tRPC](https://github.com/trpc/trpc)'s `@trpc/tanstack-react-query`, which is MIT licensed, © Alex Johansson. Thanks to the tRPC team for the design this builds on.
