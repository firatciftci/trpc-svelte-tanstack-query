<script lang="ts">
  import HandlesView from "#demo/handles-view.svelte";
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();
</script>

<h1>Handles in a universal load</h1>
<HandlesView handles={data.handles} />
