<script lang="ts">
  import type { Snippet } from "svelte";
  import { HydrationBoundary } from "@tanstack/svelte-query";
  import type { LayoutData } from "./$types";
  import LayoutInfo from "./layout-info.svelte";

  const { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<HydrationBoundary state={data.layoutState}>
  <LayoutInfo />
  <p data-testid="layout-hashes">{data.layoutState.queries.map((query) => query.queryHash).join(" ")}</p>
  {@render children()}
</HydrationBoundary>
