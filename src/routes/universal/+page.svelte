<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "#demo/context.js";

  const trpc = useTRPC();
  const greeting = createQuery(() => trpc.greeting.queryOptions({ name: "universal" }));
</script>

<h1>Universal load</h1>
{#if greeting.data}
  <p data-testid="greeting">{greeting.data.text} at {greeting.data.at.toISOString()}</p>
{:else}
  <p>loading greeting</p>
{/if}
