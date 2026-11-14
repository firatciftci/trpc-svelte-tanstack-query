<script lang="ts">
  import type { Snippet } from "svelte";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import { untrack } from "svelte";
  import { createDemoClient } from "#demo/client.js";
  import { setTRPCContext } from "#demo/context.js";
  import type { LayoutData } from "./$types";

  const { data, children }: { data: LayoutData; children: Snippet } = $props();

  untrack(() => setTRPCContext({ trpcClient: createDemoClient(), queryClient: data.queryClient }));
</script>

<QueryClientProvider client={data.queryClient}>
  {@render children()}
</QueryClientProvider>
