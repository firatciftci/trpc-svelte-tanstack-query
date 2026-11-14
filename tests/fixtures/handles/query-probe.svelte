<script lang="ts">
  import { untrack } from "svelte";

  const {
    create,
  }: {
    create: () => { readonly status: string; readonly data: unknown; readonly error: unknown };
  } = $props();

  const query = untrack(() => create());
</script>

<p>status:{query.status}</p>
<p>data:{JSON.stringify(query.data) ?? "none"}</p>
<p>error:{query.error == null ? "none" : String(query.error)}</p>
