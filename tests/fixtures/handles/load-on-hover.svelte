<script lang="ts">
  import { untrack } from "svelte";
  import type { TRPCOptionsProxy } from "#lib/index.js";
  import type { HandlesRouter } from "#tests/fixtures/handles/router.js";
  import { ensureEntry, loadHandles } from "#lib/unstable-handles/index.js";

  const {
    setup,
    onLoad,
  }: {
    setup: () => TRPCOptionsProxy<HandlesRouter>;
    onLoad: (load: Promise<unknown>) => void;
  } = $props();

  const trpc = untrack(() => setup());
</script>

<button
  type="button"
  onmouseenter={() => onLoad(loadHandles(trpc, { post: ensureEntry(trpc.post.byId, { id: "1" }) }))}
>
  post
</button>
