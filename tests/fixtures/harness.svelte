<script lang="ts">
  import type { QueryClient } from "@tanstack/svelte-query";
  import type { ComponentProps } from "svelte";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import Provide from "#tests/fixtures/provide.svelte";

  const {
    queryClient,
    provide,
    setup,
  }: {
    queryClient: QueryClient;
    provide: ComponentProps<typeof Provide>["provide"];
    setup: ComponentProps<typeof Provide>["setup"];
  } = $props();
</script>

<QueryClientProvider client={queryClient}>
  <Provide {provide} {setup} />
</QueryClientProvider>
