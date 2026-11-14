<script lang="ts">
  import { untrack } from "svelte";

  const {
    setup,
  }: {
    setup: () => { view: () => Record<string, unknown>; actions?: Record<string, () => void> };
  } = $props();

  const probe = untrack(() => setup());
  const entries = $derived(Object.entries(probe.view()));
  const actions = Object.entries(probe.actions ?? {});

  function format(value: unknown) {
    if (value instanceof Error) {
      return value.message;
    }
    if (value != null && typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }
</script>

{#each entries as [key, value] (key)}
  <div data-testid={key}>{key}:{format(value)}</div>
{/each}
{#each actions as [name, action] (name)}
  <button data-testid={name} onclick={action}>{name}</button>
{/each}
