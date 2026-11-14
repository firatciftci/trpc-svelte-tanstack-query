import type { TRPCClientErrorLike } from "@trpc/client";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import {
  createInfiniteQuery,
  createQuery,
  QueryClient,
  skipToken,
} from "@tanstack/svelte-query";
import { TRPCError } from "@trpc/server";
import { describe, expectTypeOf, test } from "vitest";
import type { TRPCOptionsProxy } from "#lib/index.js";
import type {
  inferInfiniteQueryHandle,
  inferQueryHandle,
  TRPCInfiniteQueryHandle,
  TRPCQueryHandle,
} from "#lib/unstable-handles/index.js";
import type { HandlesRouter } from "#tests/fixtures/handles/router.js";
import { createTRPCContext, createTRPCOptionsProxy } from "#lib/index.js";
import {
  ensureEntry,
  ensureInfiniteEntry,
  fetchEntry,
  fetchInfiniteEntry,
  fromHandle,
  isTRPCEntryError,
  loadHandles,
  loadHandlesSettled,
  prefetchEntry,
  prefetchInfiniteEntry,
} from "#lib/unstable-handles/index.js";

type TRPC = TRPCOptionsProxy<HandlesRouter>;
type Post = { id: string; title: string };
type ListPage = { items: Array<number>; nextCursor: number };

declare const trpc: TRPC;
declare const id: string;
declare const isAdmin: boolean;

describe("loading", () => {
  test("loadHandlesSettled gives a result for every fetch and ensure entry", async () => {
    const [handles, results] = await loadHandlesSettled(trpc, {
      post: ensureEntry(trpc.post.byId, { id: "1" }),
      list: fetchInfiniteEntry(trpc.post.list, { limit: 2 }),
      prefetched: prefetchEntry(trpc.viewer),
    });
    expectTypeOf(handles.post).toEqualTypeOf<
      inferQueryHandle<TRPC["post"]["byId"]>
    >();
    expectTypeOf(handles.prefetched).toEqualTypeOf<
      inferQueryHandle<TRPC["viewer"]>
    >();
    expectTypeOf<keyof typeof results>().toEqualTypeOf<"post" | "list">();
    // @ts-expect-error a prefetch entry has no result
    void results.prefetched;

    if (results.post.status === "error") {
      expectTypeOf(results.post.error.code).toEqualTypeOf<
        TRPC_ERROR_CODE_KEY | undefined
      >();
      expectTypeOf(results.post.error.cause).toEqualTypeOf<
        TRPCClientErrorLike<HandlesRouter> | TRPCError
      >();
      // @ts-expect-error a failed entry has no data
      void results.post.data;
    } else {
      expectTypeOf(results.post.data).toEqualTypeOf<Post>();
    }
    if (results.list.status === "success") {
      expectTypeOf(results.list.data.pages[0]!.items).toEqualTypeOf<
        Array<number>
      >();
    }
  });

  test("a skipToken entry has an undefined handle and no data or result", async () => {
    const [handles, data] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id: "1" }),
      draft: isAdmin
        ? ensureEntry(trpc.post.draftById, { id: "1" })
        : skipToken,
      never: skipToken,
    });
    expectTypeOf(handles.draft).toEqualTypeOf<
      inferQueryHandle<TRPC["post"]["draftById"]> | undefined
    >();
    expectTypeOf(handles.never).toEqualTypeOf<undefined>();
    expectTypeOf<keyof typeof data>().toEqualTypeOf<"post">();
    // @ts-expect-error a maybe-skipped entry may have no data
    void data.draft;

    const [, _results] = await loadHandlesSettled(trpc, {
      draft: isAdmin ? fetchEntry(trpc.post.draftById, { id: "1" }) : skipToken,
    });
    expectTypeOf<keyof typeof _results>().toEqualTypeOf<never>();

    // @ts-expect-error read a maybe-skipped handle only once it's there
    fromHandle(trpc, handles.draft);
    if (handles.draft != null) {
      fromHandle(trpc, handles.draft);
    }
  });

  test("isTRPCEntryError narrows to the error of the procedure it matches", async () => {
    const [handles] = await loadHandles(trpc, {
      post: ensureEntry(trpc.post.byId, { id: "1" }),
    }).catch((error: unknown) => {
      // @ts-expect-error a rejection is unknown until it's narrowed
      void error.cause;
      if (isTRPCEntryError(error, trpc.post.byId)) {
        expectTypeOf(error.key).toEqualTypeOf<string>();
        expectTypeOf(error.path).toEqualTypeOf<string>();
        expectTypeOf(error.code).toEqualTypeOf<
          TRPC_ERROR_CODE_KEY | undefined
        >();
        expectTypeOf(error.cause).toEqualTypeOf<
          TRPCClientErrorLike<HandlesRouter> | TRPCError
        >();
      }
      if (isTRPCEntryError(error)) {
        expectTypeOf(error.cause.message).toEqualTypeOf<string>();
        if (!(error.cause instanceof TRPCError)) {
          expectTypeOf(error.cause.data).not.toBeNever();
          expectTypeOf(error.cause.shape).not.toBeNever();
        }
      }
      throw error;
    });
    expectTypeOf(handles.post).toEqualTypeOf<
      inferQueryHandle<TRPC["post"]["byId"]>
    >();
  });

  test("a load gives a handle for every entry and data for fetch and ensure entries", async () => {
    type PostHandle = inferQueryHandle<TRPC["post"]["byId"]>;
    type ListHandle = inferInfiniteQueryHandle<TRPC["post"]["list"]>;

    const loaded = await loadHandles(trpc, {
      prefetched: prefetchEntry(trpc.post.byId, { id: "1" }),
      fetched: fetchEntry(trpc.post.byId, { id: "2" }),
      ensured: ensureEntry(trpc.post.byId, { id: "3" }),
      list: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
      fetchedList: fetchInfiniteEntry(trpc.post.list, { limit: 3 }),
      prefetchedList: prefetchInfiniteEntry(trpc.post.list, { limit: 4 }),
      viewer: prefetchEntry(trpc.viewer),
    });
    const [handles, data] = loaded;
    expectTypeOf(handles.prefetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.fetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.ensured).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.list).toEqualTypeOf<ListHandle>();
    expectTypeOf(handles.viewer).toEqualTypeOf<
      inferQueryHandle<TRPC["viewer"]>
    >();

    expectTypeOf(data).toEqualTypeOf<{
      fetched: Post;
      ensured: Post;
      list: { pages: Array<ListPage>; pageParams: Array<number | null> };
      fetchedList: { pages: Array<ListPage>; pageParams: Array<number | null> };
    }>();
    // @ts-expect-error a prefetched query may have no data yet
    void data.prefetched;
    // @ts-expect-error nor a prefetched infinite query
    void data.prefetchedList;

    // @ts-expect-error the tuple is readonly
    loaded[0] = handles;
  });

  test("entries check their input", () => {
    // @ts-expect-error input is required
    prefetchEntry(trpc.post.byId);
    // @ts-expect-error input is checked
    fetchEntry(trpc.post.byId, { id: 1 });
    ensureEntry(trpc.viewer);
    // @ts-expect-error only entries can be loaded
    void loadHandles(trpc, { post: { id: "1" } });
  });

  test("infinite entries only load several pages with getNextPageParam", () => {
    fetchInfiniteEntry(
      trpc.post.list,
      { limit: 2 },
      { pages: 2, getNextPageParam: (last) => last.nextCursor },
    );
    // @ts-expect-error pages needs getNextPageParam
    fetchInfiniteEntry(trpc.post.list, { limit: 2 }, { pages: 2 });
    prefetchInfiniteEntry(
      trpc.post.list,
      { limit: 2 },
      { getNextPageParam: (last) => last.nextCursor },
    );
  });

  test("setTRPCContext and createTRPCOptionsProxy proxies load handles and build entries", () => {
    const plain = createTRPCOptionsProxy<HandlesRouter>({
      router: {} as HandlesRouter,
      ctx: {},
      queryClient: new QueryClient(),
    });
    void loadHandles(plain, {
      post: prefetchEntry(plain.post.byId, { id: "1" }),
    });
    const { useTRPC } = createTRPCContext<HandlesRouter>();
    const fromContext = useTRPC();
    void loadHandlesSettled(fromContext, {
      post: ensureEntry(fromContext.post.byId, { id: "1" }),
      list: ensureInfiniteEntry(fromContext.post.list, { limit: 2 }),
    });
    void fromHandle(fromContext, {} as inferQueryHandle<TRPC["post"]["byId"]>);
  });
});

describe("reading", () => {
  test("handles infer input and output", async () => {
    type PostHandle = inferQueryHandle<TRPC["post"]["byId"]>;
    const [handles] = await loadHandles(trpc, {
      post: prefetchEntry(trpc.post.byId, { id: "1" }),
    });
    expectTypeOf(handles.post).toEqualTypeOf<PostHandle>();

    const query = createQuery(() => fromHandle(trpc, handles.post));
    expectTypeOf(query.data).toEqualTypeOf<Post | undefined>();
    expectTypeOf(query.error?.data?.code).toEqualTypeOf<
      TRPC_ERROR_CODE_KEY | undefined
    >();

    const selected = createQuery(() =>
      fromHandle(trpc, handles.post, { select: (post) => post.title }),
    );
    expectTypeOf(selected.data).toEqualTypeOf<string | undefined>();

    // @ts-expect-error a raw input isn't a handle
    fromHandle(trpc, { id: "1" });
    const queryKey = [["post", "byId"], { input: { id: "1" } }];
    // @ts-expect-error nor is a query key
    fromHandle(trpc, { queryKey });
    // @ts-expect-error nor is an entry
    fromHandle(trpc, prefetchEntry(trpc.post.byId, { id }));
  });

  test("infinite handles need getNextPageParam and do not mix with query handles", async () => {
    type ListHandle = inferInfiniteQueryHandle<TRPC["post"]["list"]>;
    const [{ list }] = await loadHandles(trpc, {
      list: prefetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    expectTypeOf(list).toEqualTypeOf<ListHandle>();

    const opts = fromHandle(trpc, list, {
      getNextPageParam: (last) => last.nextCursor,
    });
    expectTypeOf(opts.queryKey).toExtend<ReadonlyArray<unknown>>();

    // @ts-expect-error infinite handles need options
    fromHandle(trpc, list);

    const post = {} as inferQueryHandle<TRPC["post"]["byId"]>;
    const query: TRPCQueryHandle = post;
    void query;
    // @ts-expect-error an infinite handle isn't a query handle
    const wrong: inferQueryHandle<TRPC["post"]["byId"]> = list;
    void wrong;
    // @ts-expect-error a query handle isn't an infinite handle
    const wrong2: TRPCInfiniteQueryHandle = post;
    void wrong2;
  });

  test("fromHandle takes any router level, loadHandles a router", () => {
    const handle = {} as inferQueryHandle<TRPC["post"]["byId"]>;
    expectTypeOf(fromHandle(trpc.post, handle)).toEqualTypeOf(
      fromHandle(trpc, handle),
    );
    void loadHandles(trpc, { post: fetchEntry(trpc.post.byId, { id: "1" }) });
    // @ts-expect-error entries take a procedure
    void prefetchEntry(trpc.post, { id: "1" });
    // @ts-expect-error infinite entries take a procedure with a cursor input
    void prefetchInfiniteEntry(trpc.post.byId, { id: "1" });
  });

  test("a handle is not a proxy", () => {
    const handle = {} as inferQueryHandle<TRPC["post"]["byId"]>;
    // @ts-expect-error loadHandles takes the proxy
    void loadHandles(handle, {});
    // @ts-expect-error entries take a procedure
    void prefetchEntry(handle, { id: "1" });
    // @ts-expect-error fromHandle takes the proxy
    void fromHandle(handle, handle);
  });

  test("handles of same-signature procedures are interchangeable", () => {
    const draft: inferQueryHandle<TRPC["post"]["byId"]> =
      {} as inferQueryHandle<TRPC["post"]["draftById"]>;
    void draft;
  });

  test("every entry gives the same handle, with no data", async () => {
    type PostHandle = inferQueryHandle<TRPC["post"]["byId"]>;
    type ListHandle = inferInfiniteQueryHandle<TRPC["post"]["list"]>;
    const [handles] = await loadHandles(trpc, {
      ensured: ensureEntry(trpc.post.byId, { id: "1" }),
      fetched: fetchEntry(trpc.post.byId, { id: "1" }),
      ensuredList: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
      fetchedList: fetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    expectTypeOf(handles.ensured).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.fetched).toEqualTypeOf<PostHandle>();
    expectTypeOf(handles.ensuredList).toEqualTypeOf<ListHandle>();
    expectTypeOf(handles.fetchedList).toEqualTypeOf<ListHandle>();
    expectTypeOf<
      "data" extends keyof PostHandle ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<
      "data" extends keyof ListHandle ? true : false
    >().toEqualTypeOf<false>();
  });

  test("createQuery data is possibly undefined for every entry", async () => {
    const [loaded] = await loadHandles(trpc, {
      prefetched: prefetchEntry(trpc.post.byId, { id: "1" }),
      ensured: ensureEntry(trpc.post.byId, { id: "1" }),
      fetched: fetchEntry(trpc.post.byId, { id: "1" }),
      prefetchedList: prefetchInfiniteEntry(trpc.post.list, { limit: 2 }),
      ensuredList: ensureInfiniteEntry(trpc.post.list, { limit: 2 }),
      fetchedList: fetchInfiniteEntry(trpc.post.list, { limit: 2 }),
    });
    for (const handle of [loaded.prefetched, loaded.ensured, loaded.fetched]) {
      expectTypeOf(
        createQuery(() => fromHandle(trpc, handle)).data,
      ).toEqualTypeOf<Post | undefined>();
      expectTypeOf(
        createQuery(() =>
          fromHandle(trpc, handle, { select: (post) => post.title }),
        ).data,
      ).toEqualTypeOf<string | undefined>();
    }
    const getNextPageParam = (last: ListPage) => last.nextCursor;
    for (const handle of [
      loaded.prefetchedList,
      loaded.ensuredList,
      loaded.fetchedList,
    ]) {
      expectTypeOf(
        createInfiniteQuery(() =>
          fromHandle(trpc, handle, { getNextPageParam }),
        ).data?.pages,
      ).toEqualTypeOf<Array<ListPage> | undefined>();
    }
  });

  test("placeholderData doesn't widen data", async () => {
    const [{ post }] = await loadHandles(trpc, {
      post: prefetchEntry(trpc.post.byId, { id: "1" }),
    });
    const postQuery = createQuery(() =>
      fromHandle(trpc, post, { placeholderData: { id: "1", title: "x" } }),
    );
    expectTypeOf(postQuery.data).toEqualTypeOf<Post | undefined>();
    // @ts-expect-error `extra` isn't in the procedure's output
    fromHandle(trpc, post, {
      placeholderData: { id: "1", title: "x", extra: 1 },
    });
  });

  test("only loadHandles creates handles", () => {
    const handBuilt = {
      queryKey: [["post", "byId"], { input: { id: "1" }, type: "query" }] as [
        Array<string>,
        { input: { id: string }; type: "query" },
      ],
      input: { id: "1" },
    };
    // @ts-expect-error a hand-built object isn't a handle
    fromHandle(trpc, handBuilt);
    // @ts-expect-error nor can it be passed as one
    const prop: inferQueryHandle<TRPC["post"]["byId"]> = handBuilt;
    void prop;
  });

  test("handles carry a typed input and a plain query key tuple", async () => {
    const [{ post, list }] = await loadHandles(trpc, {
      post: prefetchEntry(trpc.post.byId, { id: "1" }),
      list: prefetchInfiniteEntry(trpc.post.list, { limit: 2, cursor: 4 }),
    });
    expectTypeOf(post.input).toEqualTypeOf<{ id: string }>();
    expectTypeOf(post.queryKey).toEqualTypeOf<
      [path: Array<string>, opts?: { input?: { id: string }; type?: "query" }]
    >();
    expectTypeOf(list.input).toEqualTypeOf<{ limit: number }>();
    expectTypeOf(list.queryKey).toEqualTypeOf<
      [
        path: Array<string>,
        opts?: { input?: { limit: number }; type?: "infinite" },
      ]
    >();
  });
});
