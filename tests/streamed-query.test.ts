import type { TRPCLink } from "@trpc/client";
import { QueryClient, QueryObserver } from "@tanstack/svelte-query";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { describe, expect, it, vi } from "vitest";
import { createTRPCOptionsProxy } from "#lib/index.js";
import { isAsyncIterable } from "#lib/internals/utils.js";
import { createServerResource } from "#tests/helpers/server.js";

type Action = "chunk" | "end" | "fail";

function createCall(name: string) {
  const answered = Promise.withResolvers<void>();
  let gate = Promise.withResolvers<Action>();
  const call = {
    signal: undefined as AbortSignal | undefined,
    answered: answered.promise,
    answer: () => answered.resolve(),
    chunks: 0,
    finished: false,
    next: (action: Action) => gate.resolve(action),
    async *stream() {
      for (;;) {
        const action = await gate.promise;
        gate = Promise.withResolvers<Action>();
        if (action === "end") {
          call.finished = true;
          return;
        }
        if (action === "fail") {
          throw new Error(`${name} failed`);
        }
        yield `${name}${++call.chunks}`;
      }
    },
  };
  return call;
}

type Call = ReturnType<typeof createCall>;

function testContext() {
  const t = initTRPC.create();
  const calls: Array<Call> = [];

  const appRouter = t.router({
    stream: t.procedure.query(async (opts) => {
      const call = createCall("abc"[calls.length] ?? "z");
      call.signal = opts.signal;
      calls.push(call);
      await call.answered;
      return call.stream();
    }),
  });

  const received: Array<unknown> = [];
  const failed: Array<unknown> = [];
  async function* record(iterable: AsyncIterable<unknown>) {
    try {
      for await (const value of iterable) {
        received.push(value);
        yield value;
      }
    } catch (error) {
      failed.push(error);
      throw error;
    }
  }
  const recordLink: TRPCLink<typeof appRouter> =
    () =>
    ({ next, op }) =>
      observable((observer) =>
        next(op).subscribe({
          next(envelope) {
            const data = (envelope.result as { data?: unknown }).data;
            observer.next(
              isAsyncIterable(data)
                ? { ...envelope, result: { data: record(data) } }
                : envelope,
            );
          },
          error: (error) => observer.error(error),
          complete: () => observer.complete(),
        }),
      );

  const resource = createServerResource(appRouter);
  const client = createTRPCClient<typeof appRouter>({
    links: [recordLink, httpBatchStreamLink({ url: resource.httpUrl })],
  });
  const trpc = createTRPCOptionsProxy({
    client,
    queryClient: resource.queryClient,
  });
  const options = trpc.stream.queryOptions();
  const { queryClient } = resource;

  return {
    ...resource,
    trpc,
    calls,
    failed,
    options,
    observe: () => new QueryObserver(queryClient, options).subscribe(() => {}),
    data: () => queryClient.getQueryData(options.queryKey),
    fetchStatus: () => queryClient.getQueryState(options.queryKey)?.fetchStatus,
    async sendChunk(call: Call, chunk: string) {
      call.next("chunk");
      await vi.waitFor(() => expect(received).toContain(chunk));
    },
    async serverAborted(call: Call) {
      await vi.waitFor(() => expect(call.signal?.aborted).toBe(true));
    },
    async serverChunk(call: Call) {
      const before = call.chunks;
      call.next("chunk");
      await vi.waitFor(() => expect(call.chunks).toBe(before + 1));
    },
  };
}

function callAt(calls: Array<Call>, index: number): Call {
  const call = calls[index];
  if (call == null) {
    throw new Error(`no call at ${index}`);
  }
  return call;
}

describe("a query that streams", () => {
  it("a refetch stops the older stream from writing to the query", async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const older = callAt(t.calls, 0);
    older.answer();
    await t.sendChunk(older, "a1");
    await vi.waitFor(() => expect(t.data()).toEqual(["a1"]));

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = callAt(t.calls, 1);
    newer.answer();
    await t.sendChunk(newer, "b1");
    await vi.waitFor(() => expect(t.data()).toEqual(["b1"]));
    newer.next("end");
    await refetch;
    expect(t.fetchStatus()).toBe("idle");

    await t.sendChunk(older, "a2");
    expect(t.data()).toEqual(["b1"]);
    unsubscribe();
  });

  it("a refetch stops the older stream on the server at its next chunk", async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const older = callAt(t.calls, 0);
    older.answer();
    await t.sendChunk(older, "a1");

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = callAt(t.calls, 1);
    newer.answer();
    await t.sendChunk(newer, "b1");
    newer.next("end");
    await refetch;

    older.next("chunk");
    await t.serverAborted(older);
    expect(older.finished).toBe(false);
    expect(t.data()).toEqual(["b1"]);
    unsubscribe();
  });

  it("cancelQueries stops the stream on the server at its next chunk", async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.sendChunk(call, "a1");

    await t.queryClient.cancelQueries({ queryKey: t.options.queryKey });

    call.next("chunk");
    await t.serverAborted(call);
    expect(call.finished).toBe(false);
    expect(t.data()).toEqual(["a1"]);
    unsubscribe();
  });

  it("one options object on two QueryClients at once gives each its whole stream", async () => {
    await using t = testContext();
    const first = new QueryClient();
    const second = new QueryClient();
    const fetchingFirst = first.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = second.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const callFirst = callAt(t.calls, 0);
    const callSecond = callAt(t.calls, 1);
    callFirst.answer();
    callSecond.answer();

    await t.serverChunk(callFirst);
    await t.serverChunk(callSecond);
    await t.serverChunk(callFirst);
    await t.serverChunk(callSecond);
    callFirst.next("end");
    callSecond.next("end");

    await expect(fetchingFirst).resolves.toEqual(["a1", "a2"]);
    await expect(fetchingSecond).resolves.toEqual(["b1", "b2"]);
    expect(first.getQueryData(t.options.queryKey)).toEqual(["a1", "a2"]);
    expect(second.getQueryData(t.options.queryKey)).toEqual(["b1", "b2"]);
  });

  it("one options object on two QueryClients at once streams into each", async () => {
    await using t = testContext();
    const first = new QueryClient();
    const second = new QueryClient();
    const fetchingFirst = first.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingSecond = second.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const callFirst = callAt(t.calls, 0);
    const callSecond = callAt(t.calls, 1);
    callFirst.answer();
    callSecond.answer();

    await t.sendChunk(callFirst, "a1");
    await t.sendChunk(callSecond, "b1");
    expect(first.getQueryData(t.options.queryKey)).toEqual(["a1"]);
    expect(second.getQueryData(t.options.queryKey)).toEqual(["b1"]);

    callFirst.next("end");
    callSecond.next("end");
    await Promise.all([fetchingFirst, fetchingSecond]);
  });

  it("a query with its own queryHash gets its whole stream", async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery({
      ...t.options,
      queryHash: "mine",
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();

    await t.serverChunk(call);
    await t.serverChunk(call);
    call.next("end");

    await expect(fetching).resolves.toEqual(["a1", "a2"]);
    expect(t.queryClient.getQueryCache().get("mine")?.state.data).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("a query with its own queryHash removed before it streams stops its stream", async () => {
    await using t = testContext();
    const fetchingAtHash = t.queryClient.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const fetchingOwn = t.queryClient
      .fetchQuery({ ...t.options, queryHash: "mine" })
      .catch(() => "cancelled");
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const callAtHash = callAt(t.calls, 0);
    const callOwn = callAt(t.calls, 1);

    t.queryClient.removeQueries({
      predicate: (query) => query.queryHash === "mine",
    });
    callOwn.answer();
    await t.serverAborted(callOwn);
    callAtHash.answer();
    await t.sendChunk(callAtHash, "a1");
    callAtHash.next("end");
    await expect(fetchingAtHash).resolves.toEqual(["a1"]);
    await expect(fetchingOwn).resolves.toBe("cancelled");
    expect(t.data()).toEqual(["a1"]);
  });

  it("an older request that answers after removeQueries stays out of the new query", async () => {
    await using t = testContext();
    const fetchingOlder = t.queryClient
      .fetchQuery(t.options)
      .catch(() => "cancelled");
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));

    t.queryClient.removeQueries({ queryKey: t.options.queryKey });
    const fetchingNewer = t.queryClient.fetchQuery(
      t.trpc.stream.queryOptions(),
    );
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const older = callAt(t.calls, 0);
    const newer = callAt(t.calls, 1);
    newer.answer();
    await t.sendChunk(newer, "b1");
    await vi.waitFor(() => expect(t.data()).toEqual(["b1"]));

    older.answer();
    await t.serverAborted(older);
    expect(t.data()).toEqual(["b1"]);

    newer.next("end");
    await expect(fetchingNewer).resolves.toEqual(["b1"]);
    await expect(fetchingOlder).resolves.toBe("cancelled");
    expect(t.data()).toEqual(["b1"]);
  });

  it("an older request that answers after clear stays out of the new query", async () => {
    await using t = testContext();
    const fetchingOlder = t.queryClient
      .fetchQuery(t.options)
      .catch(() => "cancelled");
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));

    t.queryClient.clear();
    const fetchingNewer = t.queryClient.fetchQuery(
      t.trpc.stream.queryOptions(),
    );
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const older = callAt(t.calls, 0);
    const newer = callAt(t.calls, 1);

    older.answer();
    await t.serverAborted(older);
    expect(t.data()).toBeUndefined();

    newer.answer();
    newer.next("end");
    await expect(fetchingNewer).resolves.toEqual([]);
    await expect(fetchingOlder).resolves.toBe("cancelled");
  });

  it("cancelQueries before the request answers leaves the data alone", async () => {
    await using t = testContext();
    t.queryClient.setQueryData(t.options.queryKey, ["seed"]);
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));

    await t.queryClient.cancelQueries({ queryKey: t.options.queryKey });

    const call = callAt(t.calls, 0);
    call.answer();
    await t.serverAborted(call);
    expect(t.data()).toEqual(["seed"]);
    unsubscribe();
  });

  it("the current stream failing reports its error", async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.sendChunk(call, "a1");

    call.next("fail");

    await expect(fetching).rejects.toThrow("a failed");
    expect(t.queryClient.getQueryState(t.options.queryKey)).toMatchObject({
      status: "error",
      fetchStatus: "idle",
      data: ["a1"],
    });
  });

  it("an older request that answers last does not take over", async () => {
    await using t = testContext();
    t.queryClient.setQueryData(t.options.queryKey, ["seed"]);
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const older = callAt(t.calls, 0);

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = callAt(t.calls, 1);
    newer.answer();
    await t.sendChunk(newer, "b1");
    await vi.waitFor(() => expect(t.data()).toEqual(["b1"]));

    older.answer();
    await t.serverAborted(older);
    expect(t.data()).toEqual(["b1"]);

    await t.sendChunk(newer, "b2");
    await vi.waitFor(() => expect(t.data()).toEqual(["b1", "b2"]));
    newer.next("end");
    await refetch;
    expect(t.data()).toEqual(["b1", "b2"]);
    unsubscribe();
  });

  it("cancelQueries stops the stream from overwriting an optimistic update", async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.sendChunk(call, "a1");
    await vi.waitFor(() => expect(t.data()).toEqual(["a1"]));

    await t.queryClient.cancelQueries({ queryKey: t.options.queryKey });
    t.queryClient.setQueryData(t.options.queryKey, ["optimistic"]);

    await t.sendChunk(call, "a2");
    expect(t.data()).toEqual(["optimistic"]);
    unsubscribe();
  });

  it("an older stream that fails after the newer one finished changes nothing", async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const older = callAt(t.calls, 0);
    older.answer();
    await t.sendChunk(older, "a1");
    await vi.waitFor(() => expect(t.data()).toEqual(["a1"]));

    const refetch = t.queryClient.invalidateQueries({
      queryKey: t.options.queryKey,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    const newer = callAt(t.calls, 1);
    newer.answer();
    await t.sendChunk(newer, "b1");
    newer.next("end");
    await refetch;

    older.next("fail");
    await vi.waitFor(() => expect(t.failed).toHaveLength(1));
    expect(t.queryClient.getQueryState(t.options.queryKey)).toMatchObject({
      status: "success",
      fetchStatus: "idle",
      data: ["b1"],
      error: null,
    });
    unsubscribe();
  });

  it("keeps streaming into the cache after the last observer leaves", async () => {
    await using t = testContext();
    const unsubscribe = t.observe();
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.sendChunk(call, "a1");

    unsubscribe();

    await t.sendChunk(call, "a2");
    await vi.waitFor(() => expect(t.data()).toEqual(["a1", "a2"]));
    call.next("end");
    await vi.waitFor(() => expect(t.fetchStatus()).toBe("idle"));
    expect(t.data()).toEqual(["a1", "a2"]);
  });

  it("a query with its own queryKeyHashFn gets its whole stream", async () => {
    await using t = testContext();
    const fetching = t.queryClient.fetchQuery({
      ...t.options,
      queryKeyHashFn: () => "custom-hash",
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.serverChunk(call);
    call.next("end");
    await expect(fetching).resolves.toEqual(["a1"]);
    expect(
      t.queryClient.getQueryCache().get("custom-hash")?.state.data,
    ).toEqual(["a1"]);
  });

  it("streams into the QueryClient that runs the fetch", async () => {
    await using t = testContext();
    t.queryClient.setQueryData(t.options.queryKey, ["other"]);
    const queryClient = new QueryClient();
    const fetching = queryClient.fetchQuery(t.options);
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.sendChunk(call, "a1");
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(t.options.queryKey)).toEqual(["a1"]),
    );
    await t.sendChunk(call, "a2");
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(t.options.queryKey)).toEqual([
        "a1",
        "a2",
      ]),
    );
    call.next("end");
    await expect(fetching).resolves.toEqual(["a1", "a2"]);
    expect(t.data()).toEqual(["other"]);
  });

  it("a query function called with a context that has no client writes as before", async () => {
    await using t = testContext();
    const rawQueryFn: unknown = t.options.queryFn;
    const queryFn = rawQueryFn as (context: object) => Promise<unknown>;
    const fetching = queryFn({
      queryKey: t.options.queryKey,
      meta: undefined,
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(t.calls).toHaveLength(1));
    const call = callAt(t.calls, 0);
    call.answer();
    await t.sendChunk(call, "a1");
    expect(t.data()).toEqual(["a1"]);
    call.next("end");
    await expect(fetching).resolves.toEqual(["a1"]);
  });
});
