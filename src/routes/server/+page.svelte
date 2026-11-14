<script lang="ts">
  import { HydrationBoundary } from "@tanstack/svelte-query";
  import type { PageData } from "./$types";
  import ServerContent from "./server-content.svelte";

  const { data }: { data: PageData } = $props();
</script>

<h1>Server load and hydration</h1>
<p data-testid="page-hashes">{data.pageState.queries.map((query) => query.queryHash).join(" ")}</p>
<HydrationBoundary state={data.pageState}>
  <ServerContent />
</HydrationBoundary>
