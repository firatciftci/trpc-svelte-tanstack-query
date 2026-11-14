import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/svelte-query";

export function createServerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}
