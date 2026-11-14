import { dehydrateUnsent } from "#lib/index.js";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({
  locals: { queryClient, trpc },
}) => {
  await queryClient.prefetchQuery(trpc.layoutInfo.queryOptions());
  return { layoutState: dehydrateUnsent(queryClient) };
};
