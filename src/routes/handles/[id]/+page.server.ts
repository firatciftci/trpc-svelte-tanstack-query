import { error } from "@sveltejs/kit";
import { dehydrateUnsent } from "#lib/index.js";
import {
  ensureEntry,
  isTRPCEntryError,
  loadHandles,
  prefetchEntry,
  prefetchInfiniteEntry,
} from "#lib/unstable-handles/index.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { queryClient, trpc },
  params,
}) => {
  try {
    const [handles] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id: params.id }),
      viewer: prefetchEntry(trpc.viewer),
      slow: prefetchEntry(trpc.slow),
      comments: prefetchInfiniteEntry(trpc.post.comments, {
        postId: params.id,
      }),
    });
    return { handles, dehydratedState: dehydrateUnsent(queryClient) };
  } catch (error_: unknown) {
    if (
      isTRPCEntryError(error_, trpc.post.byId) &&
      error_.code === "NOT_FOUND"
    ) {
      error(404, "Post not found");
    }
    throw error_;
  }
};
