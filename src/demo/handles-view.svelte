<script lang="ts">
  import { createInfiniteQuery, createQuery } from "@tanstack/svelte-query";
  import type { TRPC } from "#demo/context.js";
  import type { inferInfiniteQueryHandle, inferQueryHandle } from "#lib/unstable-handles/index.js";
  import { useTRPC } from "#demo/context.js";
  import { fromHandle } from "#lib/unstable-handles/index.js";
  import SlowView from "./slow-view.svelte";

  const {
    handles,
  }: {
    handles: {
      post: inferQueryHandle<TRPC["post"]["byId"]>;
      viewer: inferQueryHandle<TRPC["viewer"]>;
      comments: inferInfiniteQueryHandle<TRPC["post"]["comments"]>;
      slow?: inferQueryHandle<TRPC["slow"]>;
    };
  } = $props();

  const trpc = useTRPC();
  const post = createQuery(() => fromHandle(trpc, handles.post));
  const viewer = createQuery(() => fromHandle(trpc, handles.viewer));
  const comments = createInfiniteQuery(() =>
    fromHandle(trpc, handles.comments, { getNextPageParam: (page) => page.nextCursor }),
  );
</script>

<p data-testid="post">{post.data?.title ?? "loading post"}</p>
<p data-testid="viewer">{viewer.data?.name ?? "loading viewer"}</p>
<p data-testid="comments">
  {comments.data?.pages.flatMap((page) => page.items).join(",") ?? "loading comments"}
</p>
<button type="button" disabled={!comments.hasNextPage} onclick={() => comments.fetchNextPage()}>
  more comments
</button>
{#if handles.slow != null}
  <SlowView handle={handles.slow} />
{/if}
