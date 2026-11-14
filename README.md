# trpc-svelte-tanstack-query

TanStack Svelte Query integration for [tRPC](https://trpc.io), built for Svelte 5 runes and SvelteKit.

It is a port of tRPC's official [`@trpc/tanstack-react-query`](https://trpc.io/docs/client/tanstack-react-query/setup) package. Instead of wrapping hooks, it gives you type-safe `queryOptions`, `infiniteQueryOptions`, `mutationOptions`, and `subscriptionOptions` factories for every procedure in your router, plus query keys and filters. You pass them straight to TanStack Svelte Query's `createQuery`, `createInfiniteQuery`, and `createMutation`, or to the `QueryClient` in a `load` function. If you already use the React package, the API will look familiar.

- Query, infinite query, mutation, and subscription options with full input, output, and error inference
- Query keys and filters for any procedure or router path, for invalidation and cache updates
- `createSubscription` for subscriptions, as a rune-based result
- Streaming procedures that return async iterables, through TanStack Query's `streamedQuery`
- SvelteKit server rendering: prefetch in universal or server `load` functions, and stream pending queries to the browser with `dehydrateUnsent` and `HydrationBoundary`
- Optional query key prefixes for running several tRPC clients against one `QueryClient`
- An experimental `unstable-handles` entry point, ported from tRPC, for passing serializable query handles from `load` functions to components

## Install

```sh
npm install trpc-svelte-tanstack-query @tanstack/svelte-query @trpc/client @trpc/server
```

It needs Svelte 5, TanStack Svelte Query 6.3.11 or later, and tRPC 11.28 or later.

## Setup

Create the context functions for your router once:

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

Then call `setTRPCContext` in your root layout, next to `QueryClientProvider`:

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

`setTRPCContext` returns the options proxy, and any component below the layout can get it with `useTRPC()`. If you leave out `queryClient`, it uses the one from a `QueryClientProvider` above the calling component.

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

A procedure that returns an async iterable is streamed into the query: `data` grows into an array as values arrive.

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

### Infinite queries

Procedures whose input has a `cursor` also get `infiniteQueryOptions`. The cursor goes in automatically, so leave it out of the input:

```ts
const posts = createInfiniteQuery(() =>
  trpc.post.infinite.infiniteQueryOptions(
    { limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  ),
);
```

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

Keys carry their data type, so `getQueryData` and `setQueryData` are typed too.

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

The subscription starts once the component mounts and stops when it's destroyed. It restarts when the input changes or `enabled` turns on, and it goes back to `idle` when `enabled` turns off. The result has `status` (`idle`, `connecting`, `pending`, or `error`), `data`, `error`, and `reset()`. Callbacks always see the latest options without restarting the subscription.

### Calling procedures directly

`useTRPCClient()` returns the tRPC client, for one-off calls outside of TanStack Query.

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

## SvelteKit server rendering

`createTRPCOptionsProxy` builds the same options proxy without Svelte context, so you can use it in `load` functions and hooks.

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

A server `load` can call your router directly, without an HTTP round trip. Create a `QueryClient` and a router-based proxy for each request in `hooks.server.ts`, and let pending queries be dehydrated so they can stream:

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

## Differences from `@trpc/tanstack-react-query`

- `createTRPCContext` returns `setTRPCContext`, `useTRPC`, and `useTRPCClient`. Svelte has no provider components for this, so you call `setTRPCContext` during component initialization.
- `useSubscription` is `createSubscription`, and it takes a function that returns the options, like `createQuery`. Turning `enabled` off resets the subscription to `idle`.
- `unstable_createHydrateClient` is replaced by `dehydrateUnsent` and Svelte Query's `HydrationBoundary`, which work with SvelteKit `load` functions.
- There are no suspense variants, because Svelte Query has none.
- The `ssr` request option is gone, since it had no effect.
- `queryOptions`, `mutationOptions`, and `subscriptionOptions` use the feature flags of the context they come from, so query keys from a prefixed context are typed as prefixed.

## Compatibility

| Package                        | Supported  |
| ------------------------------ | ---------- |
| `svelte`                       | `^5.25.0`  |
| `@tanstack/svelte-query`       | `^6.3.11`  |
| `@trpc/client`, `@trpc/server` | `^11.28.0` |

CI runs the test suite against the latest versions and against the lowest supported versions of tRPC and TanStack Svelte Query.

## License

[MIT](./LICENSE). Much of this package is adapted from [tRPC](https://github.com/trpc/trpc)'s `@trpc/tanstack-react-query`, which is MIT licensed, © Alex Johansson. Thanks to the tRPC team for the design this builds on.
