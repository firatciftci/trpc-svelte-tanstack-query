import { createDemoClient } from "#demo/client.js";
import { createTRPCOptionsProxy } from "#lib/index.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent }) => {
  const { queryClient } = await parent();
  const trpc = createTRPCOptionsProxy({
    client: createDemoClient(fetch),
    queryClient,
  });
  await queryClient.prefetchQuery(
    trpc.greeting.queryOptions({ name: "universal" }),
  );
};
