import type {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  GetNextPageParamFunction,
  Query,
  QueryClient,
  QueryFunction,
  QueryKey,
} from "@tanstack/svelte-query";
import { CancelledError, hashKey, skipToken } from "@tanstack/svelte-query";
import { isTRPCClientError } from "@trpc/client";
import { BROWSER, DEV } from "esm-env";
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
  DecorateRouterKeyable,
} from "#lib/internals/create-options-proxy.js";
import type {
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from "#lib/internals/infinite-query-options.js";
import type {
  UnusedSkipTokenTRPCQueryOptionsIn,
  UnusedSkipTokenTRPCQueryOptionsOut,
} from "#lib/internals/query-options.js";
import type {
  AnyTRPCQueryKey,
  ExtractCursorType,
  FeatureFlags,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
} from "#lib/internals/types.js";
import type { ErrorOf } from "#lib/unstable-handles/entry-error.js";
import { readQueryKey } from "#lib/internals/utils.js";
import {
  entryCause,
  TRPCEntryError,
} from "#lib/unstable-handles/entry-error.js";

declare const handleDef: unique symbol;
declare const entryDef: unique symbol;

type InfiniteHandleInput<TInput> = TInput extends object
  ? Omit<TInput, "cursor" | "direction">
  : TInput;

type HandleQueryKey<
  TDef extends ResolverDef,
  TInput,
  TType extends "query" | "infinite",
> = TDef["featureFlags"]["keyPrefix"] extends true
  ? [
      prefix: Array<string>,
      path: Array<string>,
      opts?: { input?: TInput; type?: TType },
    ]
  : [path: Array<string>, opts?: { input?: TInput; type?: TType }];

/**
A serializable reference to a query, from `loadHandles()`. Return it from a `load` function and read it in a
component with `fromHandle(trpc, handle)`.
*/
export interface TRPCQueryHandle<TDef extends ResolverDef = ResolverDef> {
  /**
  Type-only: never present at runtime.
  */
  readonly [handleDef]: TDef & { kind: "query" };
  readonly queryKey: HandleQueryKey<TDef, TDef["input"], "query">;
  /**
  The query's input. The key is absent when the input is `undefined`.
  */
  readonly input: TDef["input"];
}

/**
A serializable reference to an infinite query, from `loadHandles()`. Read it with
`fromHandle(trpc, handle, { getNextPageParam })`.
*/
export interface TRPCInfiniteQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
  Type-only: never present at runtime.
  */
  readonly [handleDef]: TDef & { kind: "infinite" };
  readonly queryKey: HandleQueryKey<
    TDef,
    InfiniteHandleInput<TDef["input"]>,
    "infinite"
  >;
  /**
  The query's input, without `cursor` and `direction`.
  */
  readonly input: InfiniteHandleInput<TDef["input"]>;
  readonly initialCursor?: NonNullable<ExtractCursorType<TDef["input"]>> | null;
}

/**
Any query or infinite query handle.
*/
export type AnyTRPCHandle = {
  readonly queryKey: ReadonlyArray<unknown>;
  readonly input?: unknown;
  readonly initialCursor?: unknown;
};

/**
How `loadHandles` starts an entry's query, named after the `QueryClient` method it calls: `prefetchQuery`,
`fetchQuery`, or `ensureQueryData`.
*/
export type TRPCEntryKind = "prefetch" | "fetch" | "ensure";

/**
A query for `loadHandles()` to start, from `prefetchEntry`, `fetchEntry`, or `ensureEntry`. Creating it starts
nothing.
*/
export interface TRPCQueryEntry<
  TDef extends ResolverDef = ResolverDef,
  TKind extends TRPCEntryKind = TRPCEntryKind,
> {
  /**
  Type-only: never present at runtime.
  */
  readonly [entryDef]: { def: TDef; kind: TKind; type: "query" };
}

/**
An infinite query for `loadHandles()` to start, from `prefetchInfiniteEntry`, `fetchInfiniteEntry`, or
`ensureInfiniteEntry`. Creating it starts nothing.
*/
export interface TRPCInfiniteQueryEntry<
  TDef extends ResolverDef = ResolverDef,
  TKind extends TRPCEntryKind = TRPCEntryKind,
> {
  /**
  Type-only: never present at runtime.
  */
  readonly [entryDef]: { def: TDef; kind: TKind; type: "infinite" };
}

/**
Any query or infinite query entry.
*/
export type AnyTRPCEntry = TRPCQueryEntry | TRPCInfiniteQueryEntry;

/**
What `loadHandles()` takes per key: an entry, or TanStack Query's `skipToken` to start nothing for that key.
*/
export type TRPCLoadEntries = Record<string, AnyTRPCEntry | typeof skipToken>;

type HandleOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef extends ResolverDef>
    ? TRPCQueryHandle<TDef>
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef extends ResolverDef>
      ? TRPCInfiniteQueryHandle<TDef>
      : TEntry extends typeof skipToken
        ? undefined
        : never;

type DataOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef extends ResolverDef>
    ? TDef["output"]
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef extends ResolverDef>
      ? TRPCInfiniteData<TDef["input"], TDef["output"]>
      : never;

type HandlesOf<TEntries extends TRPCLoadEntries> = {
  [TKey in keyof TEntries]: HandleOfEntry<TEntries[TKey]>;
};

type DefOfEntry<TEntry> = TEntry extends {
  readonly [entryDef]: { def: infer TDef extends ResolverDef };
}
  ? TDef
  : never;

type WaitedKey<TEntries, TKey extends keyof TEntries> = TEntries[TKey] extends {
  readonly [entryDef]: { kind: "fetch" | "ensure" };
}
  ? TKey
  : never;

type DataOf<TEntries extends TRPCLoadEntries> = {
  [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: DataOfEntry<
    TEntries[TKey]
  >;
};

type ResultsOf<TEntries extends TRPCLoadEntries> = {
  [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: TRPCEntryResult<
    DefOfEntry<TEntries[TKey]>,
    DataOfEntry<TEntries[TKey]>
  >;
};

/**
What `loadHandlesSettled()` has for a fetch or ensure entry: its data, or the error it failed with.
*/
export type TRPCEntryResult<TDef extends ResolverDef, TData> =
  | { readonly status: "success"; readonly data: TData }
  | { readonly status: "error"; readonly error: TRPCEntryError<TDef> };

/**
What `loadHandles()` resolves to: `[handles, data]`. `handles` has a handle for every entry, by the entry's key, and
`undefined` for a `skipToken`. `data` has the data of every fetch and ensure entry, by the entry's key.
*/
export type TRPCLoadedHandles<TEntries extends TRPCLoadEntries> = readonly [
  handles: HandlesOf<TEntries>,
  data: DataOf<TEntries>,
];

/**
What `loadHandlesSettled()` resolves to: `[handles, results]`. `results` has a `TRPCEntryResult` for every fetch
and ensure entry, by the entry's key.
*/
export type TRPCSettledHandles<TEntries extends TRPCLoadEntries> = readonly [
  handles: HandlesOf<TEntries>,
  results: ResultsOf<TEntries>,
];

/**
Options for an entry.
*/
export interface TRPCEntryOptions
  extends
    Pick<
      FetchQueryOptions,
      "staleTime" | "retry" | "retryDelay" | "gcTime" | "meta"
    >,
    TRPCQueryBaseOptions {}

type HandleGetNextPageParam<TDef extends ResolverDef> =
  GetNextPageParamFunction<
    NonNullable<ExtractCursorType<TDef["input"]>> | null,
    TDef["output"]
  >;

/**
Options for an infinite query entry. Pass `pages` and `getNextPageParam` to load several pages up front.
*/
export type TRPCInfiniteEntryOptions<TDef extends ResolverDef> =
  TRPCEntryOptions & {
    initialCursor?: NonNullable<ExtractCursorType<TDef["input"]>> | null;
  } & (
      | {
          pages?: never;
          /**
        Without it, refetching a cached query with more than one page fails on the second page.
        */
          getNextPageParam?: HandleGetNextPageParam<TDef>;
        }
      | {
          /**
        Number of pages to load up front.
        */
          pages: number;
          getNextPageParam: HandleGetNextPageParam<TDef>;
        }
    );

type EntryArgs<TDef extends ResolverDef> = undefined extends TDef["input"]
  ? [input?: TDef["input"], opts?: TRPCEntryOptions]
  : [input: TDef["input"], opts?: TRPCEntryOptions];

/**
The handle type of a query procedure, for typing props.

@example
```ts
type PostHandle = inferQueryHandle<TRPC["post"]["byId"]>;
```
*/
export type inferQueryHandle<TProcedure extends { queryOptions: unknown }> =
  TProcedure extends DecorateQueryProcedure<infer TDef>
    ? TRPCQueryHandle<TDef>
    : never;

/**
The handle type of an infinite query procedure, for typing props.
*/
export type inferInfiniteQueryHandle<
  TProcedure extends { infiniteQueryOptions: unknown },
> =
  TProcedure extends DecorateInfiniteQueryProcedure<infer TDef>
    ? TRPCInfiniteQueryHandle<TDef>
    : never;

type HandleType = "query" | "infinite";

type ProcedureOptions = {
  queryKey: AnyTRPCQueryKey;
  queryFn?: unknown;
  enabled?: unknown;
  initialPageParam?: unknown;
};

type UntypedProxy = {
  (...args: Array<unknown>): unknown;
  readonly [segment: string]: UntypedProxy | undefined;
};

function at(proxy: UntypedProxy, segment: string): UntypedProxy {
  return proxy[segment]!;
}

type ProxyContext = {
  proxy: UntypedProxy;
  path: Array<string>;
  prefix: string | undefined;
};

type EntryState = {
  kind: TRPCEntryKind;
  type: HandleType;
  options: ProcedureOptions;
  queryClient: QueryClient;
};

type ReadHandle = { type: HandleType; path: Array<string>; input: unknown };

type LoadResult = readonly [
  handles: Record<string, unknown>,
  data: Record<string, unknown>,
];

type SettledLoad =
  | { status: "success"; data: unknown }
  | { status: "error"; error: TRPCEntryError };

const notAHandle = "Expected a tRPC handle from `loadHandles()`";

function readHandle(
  handle: AnyTRPCHandle,
  prefix: string | undefined,
): ReadHandle {
  const queryKey: unknown = (handle as AnyTRPCHandle | null | undefined)
    ?.queryKey;
  if (!Array.isArray(queryKey)) {
    throw new TypeError(`${notAHandle}, got ${JSON.stringify(handle)}`);
  }
  const data = readQueryKey(queryKey as AnyTRPCQueryKey);
  const type = data.args?.type;
  if (type !== "query" && type !== "infinite") {
    throw new TypeError(
      `${notAHandle}, got a key of type ${String(type)} for "${data.path.join(".")}"`,
    );
  }
  if (data.prefix?.[0] !== prefix) {
    throw new Error(
      `The handle for "${data.path.join(".")}" was created with keyPrefix ${JSON.stringify(data.prefix?.[0])}, but this proxy uses ${JSON.stringify(prefix)}`,
    );
  }
  return { type, path: data.path, input: data.args?.input };
}

function toHandle(
  options: ProcedureOptions,
  type: HandleType,
): Record<string, unknown> {
  const input = readQueryKey(options.queryKey).args?.input;
  const handle: Record<string, unknown> = {
    queryKey: options.queryKey,
    ...(input !== undefined && { input }),
  };
  if (type === "infinite" && options.initialPageParam != null) {
    handle.initialCursor = options.initialPageParam;
  }
  return handle;
}

const entryState = Symbol("trpc-svelte-tanstack-query.handleEntry");

function readEntry(key: string, entry: unknown): EntryState {
  const state =
    entry != null && typeof entry === "object"
      ? (Reflect.get(entry, entryState) as EntryState | undefined)
      : undefined;
  if (state == null) {
    throw new TypeError(
      `Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\`, or \`ensureEntry()\`, or \`skipToken\`, for "${key}", got ${JSON.stringify(entry)}`,
    );
  }
  return state;
}

async function startEntry(
  queryClient: QueryClient,
  state: EntryState,
): Promise<unknown> {
  if (state.type === "infinite") {
    const options = state.options as FetchInfiniteQueryOptions<
      unknown,
      unknown,
      unknown,
      QueryKey,
      unknown
    >;
    switch (state.kind) {
      case "prefetch": {
        return queryClient.prefetchInfiniteQuery(options);
      }
      case "ensure": {
        return queryClient.ensureInfiniteQueryData({
          ...options,
          revalidateIfStale: true,
        });
      }
      case "fetch": {
        return queryClient.fetchInfiniteQuery(options);
      }
    }
  }
  const options = state.options as FetchQueryOptions<
    unknown,
    unknown,
    unknown,
    QueryKey
  >;
  switch (state.kind) {
    case "prefetch": {
      return queryClient.prefetchQuery(options);
    }
    case "ensure": {
      return queryClient.ensureQueryData({
        ...options,
        revalidateIfStale: true,
      });
    }
    case "fetch": {
      return queryClient.fetchQuery(options);
    }
  }
}

function toEntryError(
  key: string,
  state: EntryState,
  error: unknown,
): CancelledError | TRPCEntryError {
  if (error instanceof CancelledError) {
    return error;
  }
  return new TRPCEntryError({
    key,
    path: readQueryKey(state.options.queryKey).path.join("."),
    ...entryCause(error),
  });
}

async function settleLoad(promise: Promise<unknown>): Promise<SettledLoad> {
  try {
    return { status: "success", data: await promise };
  } catch (error: unknown) {
    if (isTRPCEntryError(error)) {
      return { status: "error", error };
    }
    throw error;
  }
}

async function runEntry(
  queryClient: QueryClient,
  key: string,
  state: EntryState,
): Promise<unknown> {
  try {
    return await startEntry(queryClient, state);
  } catch (error: unknown) {
    throw toEntryError(key, state, error);
  }
}

async function startEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  settle: boolean;
}): Promise<LoadResult> {
  const { queryClient, entries } = opts;
  const loads: Array<{
    key: string;
    state: EntryState;
    promise: Promise<unknown>;
  }> = [];
  const states: Array<readonly [string, EntryState]> = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (entry === skipToken) {
      continue;
    }
    const state = readEntry(key, entry);
    if (state.queryClient !== queryClient) {
      throw new Error(
        `The entry for "${key}" was built with a proxy for another QueryClient than the root proxy that loads it`,
      );
    }
    states.push([key, state]);
  }
  for (const [key, state] of states) {
    loads.push({ key, state, promise: runEntry(queryClient, key, state) });
  }
  const waited = loads.filter((load) => load.state.kind !== "prefetch");
  const results = await Promise.all(
    waited.map(async (load) =>
      opts.settle ? settleLoad(load.promise) : load.promise,
    ),
  );

  const handles = Object.fromEntries(
    loads.map((load) => [
      load.key,
      toHandle(load.state.options, load.state.type),
    ]),
  );
  const data = Object.fromEntries(
    waited.map((load, index) => [load.key, results[index]]),
  );
  return [handles, data] as const;
}

const warnedNotHydrated = new Set<string>();

function warnIfNotHydrated(
  path: ReadonlyArray<string>,
  queryFn: QueryFunction<unknown, QueryKey, unknown>,
): QueryFunction<unknown, QueryKey, unknown> {
  return (context) => {
    if (!BROWSER) {
      const queryHash = hashKey(context.queryKey);
      if (!warnedNotHydrated.has(queryHash)) {
        warnedNotHydrated.add(queryHash);
        console.warn(
          `[trpc-svelte-tanstack-query] The handle for "${path.join(".")}" is being fetched again during server rendering. ` +
            `Unless its data is stale, the query it refers to isn't in this QueryClient. ` +
            `Render the reading component inside <HydrationBoundary> with the state the load returned, or load the handle with the QueryClient the page renders with.`,
        );
      }
    }
    return queryFn(context);
  };
}

const watchedHydrations = new WeakSet<Promise<unknown>>();

function refetchRejectedHydration(
  queryClient: QueryClient,
  type: HandleType,
  options: ProcedureOptions,
): void {
  if (!BROWSER) {
    return;
  }
  const query = queryClient
    .getQueryCache()
    .find({ queryKey: options.queryKey, exact: true });
  if (query == null) {
    return;
  }
  const isDisabled = (): boolean =>
    (typeof options.enabled === "function"
      ? (options.enabled as (query: Query) => boolean)(query)
      : options.enabled) === false;
  const { promise } = query;
  if (
    promise == null ||
    query.state.data !== undefined ||
    query.state.fetchStatus === "idle" ||
    isDisabled() ||
    watchedHydrations.has(promise)
  ) {
    return;
  }
  watchedHydrations.add(promise);
  void (async (): Promise<void> => {
    try {
      await promise;
    } catch (error: unknown) {
      if (
        isTRPCClientError(error) ||
        error instanceof CancelledError ||
        query.state.fetchStatus !== "idle" ||
        isDisabled()
      ) {
        return;
      }
      const defaulted = queryClient.defaultQueryOptions(
        options as FetchQueryOptions<unknown, unknown, unknown, QueryKey>,
      );
      try {
        await (type === "infinite"
          ? queryClient.fetchInfiniteQuery({
              ...(options as FetchInfiniteQueryOptions<
                unknown,
                unknown,
                unknown,
                QueryKey,
                unknown
              >),
              retry: defaulted.retry ?? 3,
            })
          : query.fetch(defaulted));
      } catch {}
    }
  })();
}

function prepareHandleRead(opts: {
  queryClient: QueryClient;
  handle: ReadHandle;
  options: ProcedureOptions;
}): ProcedureOptions {
  const { options } = opts;
  if (DEV && typeof options.queryFn === "function") {
    options.queryFn = warnIfNotHydrated(
      opts.handle.path,
      options.queryFn as QueryFunction<unknown, QueryKey, unknown>,
    );
  }
  refetchRejectedHydration(opts.queryClient, opts.handle.type, options);
  return options;
}

function readProxy(proxy: unknown, fn: string): ProxyContext {
  const queryKey: unknown =
    proxy != null && (typeof proxy === "object" || typeof proxy === "function")
      ? (proxy as { queryKey?: unknown }).queryKey
      : undefined;
  if (Array.isArray(queryKey)) {
    throw new TypeError(
      `\`${fn}()\` expects a tRPC options proxy or one of its procedures, got a handle for \`${readQueryKey(queryKey as AnyTRPCQueryKey).path.join(".")}\``,
    );
  }
  if (typeof queryKey !== "function") {
    throw new TypeError(
      `\`${fn}()\` expects a tRPC options proxy or one of its procedures, got ${String(proxy)}`,
    );
  }
  const key = readQueryKey((queryKey as () => AnyTRPCQueryKey)());
  return {
    proxy: proxy as UntypedProxy,
    path: key.path,
    prefix: key.prefix?.[0],
  };
}

function queryClientOf(ctx: ProxyContext): QueryClient {
  return at(ctx.proxy, "~queryClient")() as QueryClient;
}

function optionsOf(
  procedure: UntypedProxy,
  type: HandleType,
  input: unknown,
  opts: unknown,
): ProcedureOptions {
  return at(
    procedure,
    type === "infinite" ? "infiniteQueryOptions" : "queryOptions",
  )(input, opts) as ProcedureOptions;
}

function readRoot(trpc: unknown, fn: string): ProxyContext {
  const ctx = readProxy(trpc, fn);
  if (ctx.path.length > 0) {
    throw new Error(
      `\`${fn}()\` takes the root proxy, \`trpc\`, got \`trpc.${ctx.path.join(".")}\``,
    );
  }
  return ctx;
}

function entry(opts: {
  fn: string;
  type: HandleType;
  kind: TRPCEntryKind;
  procedure: unknown;
  input: unknown;
  opts: unknown;
}): unknown {
  const ctx = readProxy(opts.procedure, opts.fn);
  const state: EntryState = {
    type: opts.type,
    kind: opts.kind,
    options: optionsOf(ctx.proxy, opts.type, opts.input, opts.opts),
    queryClient: queryClientOf(ctx),
  };
  return { [entryState]: state };
}

/**
Whether `error` is a failed entry from `loadHandles()`. Pass a procedure to check that the entry was for it, which
types `error.cause` with its errors.

@example
```ts
const [handles] = await loadHandles(trpc, {
  post: ensureEntry(trpc.post.byId, { id }),
}).catch((cause: unknown) => {
  if (isTRPCEntryError(cause, trpc.post.byId) && cause.code === "NOT_FOUND") {
    error(404, "Post not found");
  }
  throw cause;
});
```
*/
export function isTRPCEntryError<TDef extends ResolverDef>(
  error: unknown,
  procedure: DecorateQueryProcedure<TDef>,
): error is TRPCEntryError<TDef>;
export function isTRPCEntryError(error: unknown): error is TRPCEntryError;
export function isTRPCEntryError(error: unknown, procedure?: unknown): boolean {
  if (!(error instanceof TRPCEntryError)) {
    return false;
  }
  return (
    procedure === undefined ||
    error.path === readProxy(procedure, "isTRPCEntryError").path.join(".")
  );
}

/**
Starts every entry before it waits for any, so the order of the entries doesn't matter. Resolves to
`[handles, data]` once every fetch and ensure entry has data. Rejects as soon as a fetch or ensure entry fails.
Prefetch entries never make it reject.

Put TanStack Query's `skipToken` in place of an entry to start nothing for that key: its handle is `undefined`, and
`data` has no key for it.

Takes the root of an options proxy, from `createTRPCOptionsProxy`. Call it in a `load` function, not during render.

@example
```ts
const [handles, data] = await loadHandles(trpc, {
  comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
  post: ensureEntry(trpc.post.byId, { id }),
});
if (!data.post.published) error(404, "Post not found");
return { handles };
```
*/
export async function loadHandles<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): Promise<TRPCLoadedHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readRoot(trpc, "loadHandles")),
    entries,
    settle: false,
  }) as Promise<TRPCLoadedHandles<TEntries>>;
}

/**
Like `loadHandles()`, but it waits for every fetch and ensure entry to settle and never rejects because one failed.
Resolves to `[handles, results]`: `results` has `{ status: "success", data }` or `{ status: "error", error }`, with a
`TRPCEntryError`, for every fetch and ensure entry. A cancelled query still rejects.
*/
export async function loadHandlesSettled<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): Promise<TRPCSettledHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readRoot(trpc, "loadHandlesSettled")),
    entries,
    settle: true,
  }) as Promise<TRPCSettledHandles<TEntries>>;
}

/**
An entry for `loadHandles()` that starts the query without waiting, like `queryClient.prefetchQuery`. It never makes
the load reject: errors surface where the handle is read.
*/
export function prefetchEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, "prefetch">;
export function prefetchEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: "prefetchEntry",
    type: "query",
    kind: "prefetch",
    procedure,
    input,
    opts,
  });
}

/**
An entry for `loadHandles()` that waits for fresh data, like `queryClient.fetchQuery`: cached data is used only if
it isn't stale. The load rejects if the request fails.
*/
export function fetchEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, "fetch">;
export function fetchEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: "fetchEntry",
    type: "query",
    kind: "fetch",
    procedure,
    input,
    opts,
  });
}

/**
An entry for `loadHandles()` that uses any cached data, even stale, like
`queryClient.ensureQueryData({ revalidateIfStale: true })`. It fetches and waits only when the cache has no data, and
the load rejects if that request fails.
*/
export function ensureEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, "ensure">;
export function ensureEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: "ensureEntry",
    type: "query",
    kind: "ensure",
    procedure,
    input,
    opts,
  });
}

/**
Like `prefetchEntry`, for an infinite query. Loads the first page unless `pages` is set.
*/
export function prefetchInfiniteEntry<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef["input"],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, "prefetch"> {
  return entry({
    fn: "prefetchInfiniteEntry",
    type: "infinite",
    kind: "prefetch",
    procedure,
    input,
    opts,
  }) as TRPCInfiniteQueryEntry<TDef, "prefetch">;
}

/**
Like `fetchEntry`, for an infinite query.
*/
export function fetchInfiniteEntry<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef["input"],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, "fetch"> {
  return entry({
    fn: "fetchInfiniteEntry",
    type: "infinite",
    kind: "fetch",
    procedure,
    input,
    opts,
  }) as TRPCInfiniteQueryEntry<TDef, "fetch">;
}

/**
Like `ensureEntry`, for an infinite query.
*/
export function ensureInfiniteEntry<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef["input"],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, "ensure"> {
  return entry({
    fn: "ensureInfiniteEntry",
    type: "infinite",
    kind: "ensure",
    procedure,
    input,
    opts,
  }) as TRPCInfiniteQueryEntry<TDef, "ensure">;
}

/**
Options for a handle: the same options `trpc.<path>.queryOptions(input)` or
`trpc.<path>.infiniteQueryOptions(input, opts)` return for the handle's procedure and input. Pass them to
`createQuery` or `createInfiniteQuery`. `trpc` is the proxy or a router on the handle's path, usually `useTRPC()`.

@example
```svelte
<script lang="ts">
  let { data } = $props();
  const trpc = useTRPC();
  const post = createQuery(() => fromHandle(trpc, data.handles.post));
</script>
```
*/
export function fromHandle<TDef extends ResolverDef, TData = TDef["output"]>(
  trpc: DecorateRouterKeyable<NoInfer<TDef["featureFlags"]>>,
  handle: TRPCQueryHandle<TDef>,
  opts?: UnusedSkipTokenTRPCQueryOptionsIn<
    NoInfer<TDef["output"]>,
    TData,
    ErrorOf<TDef>,
    TDef["featureFlags"]
  >,
): UnusedSkipTokenTRPCQueryOptionsOut<
  TDef["output"],
  TData,
  ErrorOf<TDef>,
  TDef["featureFlags"]
>;
export function fromHandle<TDef extends ResolverDef, TData = TDef["output"]>(
  trpc: DecorateRouterKeyable<NoInfer<TDef["featureFlags"]>>,
  handle: TRPCInfiniteQueryHandle<TDef>,
  opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
    TDef["input"],
    NoInfer<TDef["output"]>,
    TData,
    ErrorOf<TDef>,
    TDef["featureFlags"]
  >,
): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TDef["input"],
  TDef["output"],
  TData,
  ErrorOf<TDef>,
  TDef["featureFlags"]
>;
export function fromHandle(
  trpc: unknown,
  rawHandle: AnyTRPCHandle,
  opts?: object,
): unknown {
  const ctx = readProxy(trpc, "fromHandle");
  const handle = readHandle(rawHandle, ctx.prefix);
  if (ctx.path.some((segment, index) => handle.path[index] !== segment)) {
    throw new Error(
      `\`fromHandle(trpc.${ctx.path.join(".")}, handle)\` got a handle for \`${handle.path.join(".")}\`, which isn't in \`${ctx.path.join(".")}\`. Pass the root proxy, \`trpc\``,
    );
  }
  let procedure = ctx.proxy;
  for (const segment of handle.path.slice(ctx.path.length)) {
    procedure = at(procedure, segment);
  }
  const options = optionsOf(
    procedure,
    handle.type,
    handle.input,
    handle.type === "infinite"
      ? { initialCursor: rawHandle.initialCursor, ...opts }
      : opts,
  );
  return prepareHandleRead({
    queryClient: queryClientOf(ctx),
    handle,
    options,
  });
}
