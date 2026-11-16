<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import type { TRPC } from "#demo/context.js";
  import type { inferQueryHandle } from "#lib/unstable-handles/index.js";
  import { useTRPC } from "#demo/context.js";
  import { fromHandle } from "#lib/unstable-handles/index.js";

  const { handle }: { handle: inferQueryHandle<TRPC["slow"]> } = $props();

  const trpc = useTRPC();
  const slow = createQuery(() => fromHandle(trpc, handle));
</script>

{#if slow.data == null}
  <p data-testid="slow">loading slow</p>
{:else}
  <p data-testid="slow">{slow.data.text} at {slow.data.at.toISOString()}</p>
{/if}
