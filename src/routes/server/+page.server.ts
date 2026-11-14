import { dehydrateUnsent } from "#lib/index.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals: { queryClient, trpc },
  parent,
}) => {
  await parent();
  void queryClient.prefetchQuery(trpc.slow.queryOptions());
  await Promise.all([
    queryClient.prefetchQuery(trpc.layoutInfo.queryOptions()),
    queryClient.prefetchQuery(trpc.greeting.queryOptions({ name: "server" })),
  ]);
  return { pageState: dehydrateUnsent(queryClient) };
};
