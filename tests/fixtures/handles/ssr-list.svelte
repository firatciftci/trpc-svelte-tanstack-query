<script lang="ts">
  import { createInfiniteQuery } from "@tanstack/svelte-query";
  import type { TRPCOptionsProxy } from "#lib/index.js";
  import type { inferInfiniteQueryHandle } from "#lib/unstable-handles/index.js";
  import type { SsrRouter } from "#tests/fixtures/handles/ssr-router.js";
  import { fromHandle } from "#lib/unstable-handles/index.js";
  import { ssrContext } from "#tests/fixtures/handles/ssr-router.js";

  const { list }: { list: inferInfiniteQueryHandle<TRPCOptionsProxy<SsrRouter>["post"]["list"]> } = $props();

  const trpc = ssrContext.useTRPC();
  const query = createInfiniteQuery(() =>
    fromHandle(trpc, list, { getNextPageParam: (page) => page.nextCursor }),
  );
</script>

{#if query.data}
  <p>items:{query.data.pages.flatMap((page) => page.items).join(",")}</p>
{:else}
  <p>loading</p>
{/if}
