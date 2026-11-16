<script lang="ts">
  import HandlesView from "#demo/handles-view.svelte";
  import { HydrationBoundary } from "@tanstack/svelte-query";
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
</script>

<h1>Handles</h1>
<HydrationBoundary state={data.dehydratedState}>
  <HandlesView handles={data.handles} />
</HydrationBoundary>
