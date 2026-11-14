<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useTRPC } from "#demo/context.js";

  const trpc = useTRPC();
  const greeting = createQuery(() => trpc.greeting.queryOptions({ name: "server" }));
  const slow = createQuery(() => trpc.slow.queryOptions());
</script>

<p data-testid="greeting">{greeting.data?.text ?? "loading greeting"}</p>
<p data-testid="slow">{slow.data == null ? "loading slow" : `${slow.data.text} at ${slow.data.at.toISOString()}`}</p>
