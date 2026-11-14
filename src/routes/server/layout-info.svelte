<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "#demo/context.js";

  const trpc = useTRPC();
  const info = createQuery(() => trpc.layoutInfo.queryOptions());
</script>

<p data-testid="layout-info">{info.data?.section ?? "loading layout"}</p>
