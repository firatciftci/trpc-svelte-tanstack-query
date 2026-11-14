<script lang="ts">
  import { resolve } from "$app/paths";
</script>

<h1>trpc-svelte-tanstack-query</h1>
<ul>
  <li><a href={resolve("/universal")}>Universal load</a></li>
  <li><a href={resolve("/server")}>Server load and hydration</a></li>
  <li><a href={resolve("/handles/[id]", { id: "1" })}>Handles</a></li>
  <li><a href={resolve("/live")}>Mutation and subscription</a></li>
</ul>
