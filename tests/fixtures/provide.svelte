<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { untrack } from "svelte";
  import Probe from "#tests/fixtures/probe.svelte";

  const { provide, setup }: { provide: () => void; setup: ComponentProps<typeof Probe>["setup"] } = $props();

  untrack(() => provide());
</script>

<Probe {setup} />
