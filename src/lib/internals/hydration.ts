import type {
  DehydratedState,
  Mutation,
  Query,
  QueryClient,
} from "@tanstack/svelte-query";
import {
  defaultShouldDehydrateMutation,
  defaultShouldDehydrateQuery,
  dehydrate,
} from "@tanstack/svelte-query";

type SentQuery = {
  dataUpdatedAt: number;
  promise: Promise<unknown> | undefined;
};

type SentEntries = {
  queries: Map<string, SentQuery>;
  mutations: WeakSet<Mutation>;
  watchingPending: boolean;
};

const sentByClient = new WeakMap<QueryClient, SentEntries>();

function sentEntries(queryClient: QueryClient): SentEntries {
  let sent = sentByClient.get(queryClient);
  if (sent == null) {
    sent = {
      queries: new Map(),
      mutations: new WeakSet(),
      watchingPending: false,
    };
    sentByClient.set(queryClient, sent);
  }
  return sent;
}

function watchPendingSends(queryClient: QueryClient, sent: SentEntries): void {
  if (sent.watchingPending) {
    return;
  }
  sent.watchingPending = true;
  queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== "updated" ||
      event.action.type !== "success" ||
      event.action.manual === true
    ) {
      return;
    }
    const entry = sent.queries.get(event.query.queryHash);
    if (entry?.promise == null || entry.promise !== event.query.promise) {
      return;
    }

    entry.dataUpdatedAt = event.query.state.dataUpdatedAt;
    entry.promise = undefined;
  });
}

function isAlreadySent(query: Query, sent: SentQuery | undefined): boolean {
  return sent != null && query.state.dataUpdatedAt <= sent.dataUpdatedAt;
}

/**
Dehydrates what the `QueryClient`'s `dehydrate` defaults select, minus the queries and mutations an earlier call
already sent for this `QueryClient` with the same or newer data. Share one `QueryClient` per request, for example in
`event.locals`, and return `dehydrateUnsent(queryClient)` from every server `load` that prefetches, so nested layouts
and pages each send only what they added.

@example
```ts
export const load = async ({ locals: { trpc, queryClient }, params }) => {
  await queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id: params.id }));
  return { dehydratedState: dehydrateUnsent(queryClient) };
};
```
*/
export function dehydrateUnsent(queryClient: QueryClient): DehydratedState {
  const defaults = queryClient.getDefaultOptions().dehydrate;
  const shouldDehydrateQuery =
    defaults?.shouldDehydrateQuery ?? defaultShouldDehydrateQuery;
  const shouldDehydrateMutation =
    defaults?.shouldDehydrateMutation ?? defaultShouldDehydrateMutation;
  const sent = sentEntries(queryClient);

  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => {
      if (
        isAlreadySent(query, sent.queries.get(query.queryHash)) ||
        !shouldDehydrateQuery(query)
      ) {
        return false;
      }
      const promise =
        query.state.status === "pending" ? query.promise : undefined;
      if (promise != null) {
        watchPendingSends(queryClient, sent);
      }
      sent.queries.set(query.queryHash, {
        dataUpdatedAt: query.state.dataUpdatedAt,
        promise,
      });
      return true;
    },
    shouldDehydrateMutation: (mutation) => {
      if (sent.mutations.has(mutation) || !shouldDehydrateMutation(mutation)) {
        return false;
      }
      sent.mutations.add(mutation);
      return true;
    },
  });
}
