<script lang="ts">
  import type { DehydratedState, QueryClient } from "@tanstack/svelte-query";
  import type { TRPCClient } from "@trpc/client";
  import { HydrationBoundary, QueryClientProvider } from "@tanstack/svelte-query";
  import { untrack } from "svelte";
  import type { TRPCOptionsProxy } from "#lib/index.js";
  import type { inferInfiniteQueryHandle, inferQueryHandle } from "#lib/unstable-handles/index.js";
  import type { SsrRouter } from "#tests/fixtures/handles/ssr-router.js";
  import SsrList from "#tests/fixtures/handles/ssr-list.svelte";
  import SsrPost from "#tests/fixtures/handles/ssr-post.svelte";
  import { ssrContext } from "#tests/fixtures/handles/ssr-router.js";

  type TRPC = TRPCOptionsProxy<SsrRouter>;

  const {
    trpcClient,
    queryClient,
    state,
    posts,
    list,
  }: {
    trpcClient: TRPCClient<SsrRouter>;
    queryClient: QueryClient;
    state: DehydratedState | undefined;
    posts: Array<inferQueryHandle<TRPC["post"]["byDay"]>>;
    list?: inferInfiniteQueryHandle<TRPC["post"]["list"]>;
  } = $props();

  untrack(() => ssrContext.setTRPCContext({ trpcClient, queryClient }));
</script>

{#snippet content()}
  {#each posts as post, index (index)}
    <SsrPost {post} />
  {/each}
  {#if list}
    <SsrList {list} />
  {/if}
{/snippet}

<QueryClientProvider client={queryClient}>
  {#if state}
    <HydrationBoundary {state}>
      {@render content()}
    </HydrationBoundary>
  {:else}
    {@render content()}
  {/if}
</QueryClientProvider>
