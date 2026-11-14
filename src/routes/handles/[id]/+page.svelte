<script lang="ts">
  import { HydrationBoundary } from "@tanstack/svelte-query";
  import type { PageData } from "./$types";
  import HandlesView from "./handles-view.svelte";

  const { data }: { data: PageData } = $props();
</script>

<h1>Handles</h1>
<HydrationBoundary state={data.dehydratedState}>
  <HandlesView handles={data.handles} />
</HydrationBoundary>
