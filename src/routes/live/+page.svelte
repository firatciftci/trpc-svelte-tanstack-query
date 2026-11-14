<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { useTRPC } from "#demo/context.js";
  import { createSubscription } from "#lib/index.js";

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const counter = createQuery(() => trpc.counter.get.queryOptions());
  const increment = createMutation(() =>
    trpc.counter.increment.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.counter.pathFilter()),
    }),
  );

  const ticks = $state<Array<number>>([]);
  const subscription = createSubscription(() =>
    trpc.ticks.subscriptionOptions(
      { count: 3 },
      {
        onData: (tick) => {
          ticks.push(tick);
        },
      },
    ),
  );

  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
</script>

<h1>Mutation and subscription</h1>
<p data-testid="counter">{counter.data ?? "loading counter"}</p>
<button type="button" disabled={!mounted || counter.data == null} onclick={() => increment.mutate()}>
  increment
</button>
<p data-testid="ticks">ticks:{ticks.join(",")}</p>
<p data-testid="subscription-status">status:{subscription.status}</p>
