import { skipToken } from "@tanstack/svelte-query";
import { createDemoClient } from "#demo/client.js";
import { createTRPCOptionsProxy } from "#lib/index.js";
import {
  ensureEntry,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
} from "#lib/unstable-handles/index.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { queryClient } = await parent();
  const trpc = createTRPCOptionsProxy({
    client: createDemoClient(fetch),
    queryClient,
  });
  const [handles] = await loadHandles(trpc, {
    post: ensureEntry(trpc.post.byId, { id: params.id }),
    viewer: prefetchEntry(trpc.viewer),
    comments: prefetchInfiniteEntry(trpc.post.comments, { postId: params.id }),
    slow: skipToken,
  });
  return { handles };
};
