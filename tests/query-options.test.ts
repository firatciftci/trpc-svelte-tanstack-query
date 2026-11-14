import type { QueryObserverResult } from "@tanstack/svelte-query";
import { QueryObserver, skipToken } from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createServerResource } from "#tests/helpers/server.js";

type Post = { id: string; title: string };

function testContext(keyPrefix?: string) {
  let iterableDeferred = Promise.withResolvers<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = Promise.withResolvers<void>();
  };
  const t = initTRPC.create({});

  const posts: Array<Post> = [{ id: "1", title: "Hello world" }];

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => "__result" as const),
      byIdWithSerializable: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => ({ id: 1, date: new Date() })),
      iterable: t.procedure.query(async function* () {
        for (let i = 0; i < 3; i++) {
          if (i > 0) {
            await iterableDeferred.promise;
          }
          yield i + 1;
        }
      }),
      list: t.procedure.query(() => posts),
    }),
  });

  return { ...createServerResource(appRouter, { keyPrefix }), nextIterable };
}

function observe<TResult>(observer: {
  getCurrentResult: () => TResult;
  subscribe: (listener: (result: TResult) => void) => () => void;
}) {
  const results: Array<TResult> = [observer.getCurrentResult()];
  const unsubscribe = observer.subscribe((result) => {
    results.push(result);
  });
  return { results, unsubscribe, latest: () => results.at(-1) };
}

describe.each(["user-123", undefined])(
  "queryOptions with keyPrefix: %s",
  (keyPrefix) => {
    it("basic", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const options = trpc.post.byId.queryOptions({ id: "1" });
      expect(options.trpc.path).toBe("post.byId");
      expect(options.queryKey).toEqual(trpc.post.byId.queryKey({ id: "1" }));

      const observer = new QueryObserver(ctx.queryClient, options);
      const { latest, unsubscribe } = observe(observer);
      await vi.waitFor(() => {
        expect(latest()?.data).toBe("__result");
      });
      unsubscribe();
    });

    it("select", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const options = trpc.post.byId.queryOptions(
        { id: "1" },
        { select: (data) => `mutated${data}` as const },
      );
      expect(options.trpc.path).toBe("post.byId");

      const observer = new QueryObserver(ctx.queryClient, options);
      const { latest, unsubscribe } = observe(observer);
      await vi.waitFor(() => {
        expect(latest()?.data).toBe("mutated__result");
      });
      expect(ctx.queryClient.getQueryData(options.queryKey)).toBe("__result");
      unsubscribe();
    });

    it("initialData", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const options = trpc.post.byId.queryOptions(
        { id: "1" },
        { initialData: "__result" },
      );
      expect(options.trpc.path).toBe("post.byId");

      const observer = new QueryObserver(ctx.queryClient, options);
      expect(observer.getCurrentResult().data).toBe("__result");
      expect(observer.getCurrentResult().status).toBe("success");
    });

    it("disabling query with skipToken", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const options = trpc.post.byId.queryOptions(skipToken);
      expect(options.queryFn).toBe(skipToken);

      const observer = new QueryObserver(ctx.queryClient, options);
      const { latest, unsubscribe } = observe(observer);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(latest()?.status).toBe("pending");
      expect(latest()?.fetchStatus).toBe("idle");
      expect(ctx.linkSpy.up).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("with extra `trpc` context", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const context = { __TEST__: true };

      const options = trpc.post.byId.queryOptions(
        { id: "1" },
        { trpc: { context } },
      );
      expect(options.trpc.path).toBe("post.byId");

      await expect(ctx.queryClient.fetchQuery(options)).resolves.toBe(
        "__result",
      );
      expect(ctx.linkSpy.up.mock.calls[0]?.[0].context).toMatchObject(context);
    });

    it("serializable output", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const data = await ctx.queryClient.fetchQuery(
        trpc.post.byIdWithSerializable.queryOptions({ id: "1" }),
      );
      const anyString: unknown = expect.any(String);
      expect(data).toEqual({ id: 1, date: anyString });
    });

    it("iterable", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const selects: Array<Array<number>> = [];

      const options = trpc.post.iterable.queryOptions(undefined, {
        select(data) {
          selects.push(data);
          return data;
        },
        trpc: { context: { stream: 1 } },
      });

      const observer = new QueryObserver(ctx.queryClient, options);
      const states: Array<{
        status: string;
        data: unknown;
        fetchStatus: string;
      }> = [];
      const record = (result: QueryObserverResult<Array<number>, unknown>) => {
        const state = {
          status: result.status,
          data: result.data,
          fetchStatus: result.fetchStatus,
        };
        const previous = states.at(-1);
        if (
          previous?.status !== state.status ||
          previous.fetchStatus !== state.fetchStatus ||
          JSON.stringify(previous.data) !== JSON.stringify(state.data)
        ) {
          states.push(state);
        }
        ctx.nextIterable();
      };
      const unsubscribe = observer.subscribe(record);
      record(observer.getCurrentResult());

      await vi.waitFor(() => {
        expect(states.at(-1)).toMatchObject({
          status: "success",
          fetchStatus: "idle",
        });
      });

      expect(states).toEqual([
        { status: "pending", data: undefined, fetchStatus: "fetching" },
        { status: "success", data: [1], fetchStatus: "fetching" },
        { status: "success", data: [1, 2], fetchStatus: "fetching" },
        { status: "success", data: [1, 2, 3], fetchStatus: "fetching" },
        { status: "success", data: [1, 2, 3], fetchStatus: "idle" },
      ]);
      expect(selects.at(-1)).toEqual([1, 2, 3]);
      for (const [index, value] of selects.entries()) {
        expect(value.length).toBeGreaterThanOrEqual(
          selects[index - 1]?.length ?? 0,
        );
      }
      unsubscribe();
    });

    it("does not fetch if called from router directly", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      await using ctx = testContext(keyPrefix);

      const post = await ctx.queryClient.fetchQuery(
        ctx.optionsProxyServer.post.byId.queryOptions({ id: "1" }),
      );

      expect(post).toBe("__result");
      expect(fetchSpy).toHaveBeenCalledTimes(0);
      fetchSpy.mockRestore();
    });

    it("initialData inference", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const options = trpc.post.list.queryOptions(undefined, {
        initialData: [],
      });
      expect(options.trpc.path).toBe("post.list");

      const observer = new QueryObserver(ctx.queryClient, {
        ...options,
        staleTime: 0,
      });
      const { latest, unsubscribe } = observe(observer);
      expect(latest()?.data).toEqual([]);
      await observer.refetch();
      await vi.waitFor(() => {
        expect(latest()?.data).toEqual([{ id: "1", title: "Hello world" }]);
      });
      unsubscribe();
    });

    it("initialData inference + select", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const noPostSymbol = Symbol("noPost");

      const options = trpc.post.list.queryOptions(undefined, {
        initialData: [],
        select: (data) => data[0] ?? noPostSymbol,
      });
      expect(options.trpc.path).toBe("post.list");

      const observer = new QueryObserver(ctx.queryClient, options);
      const { latest, unsubscribe } = observe(observer);
      expect(latest()?.data).toBe(noPostSymbol);
      await observer.refetch();
      await vi.waitFor(() => {
        expect(latest()?.data).toEqual({ id: "1", title: "Hello world" });
      });
      unsubscribe();
    });

    it("aborts the request when abortOnUnmount is set and the query is cancelled", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;

      const options = trpc.post.byId.queryOptions(
        { id: "1" },
        { trpc: { abortOnUnmount: true } },
      );
      const observer = new QueryObserver(ctx.queryClient, options);
      const unsubscribe = observer.subscribe(() => {});
      await ctx.queryClient.cancelQueries({ queryKey: options.queryKey });
      unsubscribe();

      expect(ctx.linkSpy.up.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    });
  },
);
