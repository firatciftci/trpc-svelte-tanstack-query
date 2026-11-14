<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import type { TRPCOptionsProxy } from "#lib/index.js";
  import type { inferQueryHandle } from "#lib/unstable-handles/index.js";
  import type { SsrRouter } from "#tests/fixtures/handles/ssr-router.js";
  import { fromHandle } from "#lib/unstable-handles/index.js";
  import { ssrContext } from "#tests/fixtures/handles/ssr-router.js";

  const { post }: { post: inferQueryHandle<TRPCOptionsProxy<SsrRouter>["post"]["byDay"]> } = $props();

  const trpc = ssrContext.useTRPC();
  const query = createQuery(() => fromHandle(trpc, post));
</script>

{#if query.data}
  <p>{query.data.title} v{query.data.version} fetchedAt:{query.data.fetchedAt.toISOString()}</p>
{:else}
  <p>loading</p>
{/if}
