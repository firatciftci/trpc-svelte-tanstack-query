import { MutationObserver, QueryObserver } from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTRPCOptionsProxy } from "#lib/index.js";
import { createServerResource } from "#tests/helpers/server.js";

function testContext(keyPrefix?: string) {
  const t = initTRPC.create({});

  const posts = ["initial"];

  const appRouter = t.router({
    post: t.router({
      list: t.procedure.query(() => posts),
      create: t.procedure
        .input(z.object({ text: z.string() }))
        .mutation(({ input }) => {
          posts.push(input.text);
          return "__mutationResult" as const;
        }),
      createWithSerializable: t.procedure
        .input(z.object({ text: z.string() }))
        .mutation(({ input }) => ({
          id: 1,
          text: input.text,
          date: new Date(),
        })),
    }),
  });

  return createServerResource(appRouter, { keyPrefix });
}

describe.each(["userid-123", undefined])(
  "mutationOptions with keyPrefix: %s",
  (keyPrefix) => {
    it("createMutation", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const calls: Array<string> = [];

      const options = trpc.post.create.mutationOptions({
        onMutate() {
          calls.push("onMutate");
        },
        onSettled() {
          calls.push("onSettled");
        },
        onError() {
          calls.push("onError");
        },
        onSuccess() {
          calls.push("onSuccess");
        },
      });
      expect(options.trpc.path).toBe("post.create");

      const observer = new MutationObserver(ctx.queryClient, options);
      await expect(observer.mutate({ text: "hello" })).resolves.toBe(
        "__mutationResult",
      );
      expect(observer.getCurrentResult().data).toBe("__mutationResult");
      expect(calls).toEqual(["onMutate", "onSuccess", "onSettled"]);
    });

    it("createMutation with no opts", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const calls: Array<string> = [];

      const options = trpc.post.create.mutationOptions();
      expect(options.trpc.path).toBe("post.create");

      const observer = new MutationObserver(ctx.queryClient, options);
      const unsubscribe = observer.subscribe(() => {});
      calls.push("onMutate");
      await observer.mutate(
        { text: "hello" },
        {
          onSettled() {
            calls.push("onSettled");
          },
          onError() {
            calls.push("onError");
          },
          onSuccess() {
            calls.push("onSuccess");
          },
        },
      );
      expect(observer.getCurrentResult().data).toBe("__mutationResult");
      expect(calls).toEqual(["onMutate", "onSuccess", "onSettled"]);
      unsubscribe();
    });

    it("optimistic update", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const { queryClient } = ctx;
      const calls: Array<string> = [];

      const query = new QueryObserver(
        queryClient,
        trpc.post.list.queryOptions(),
      );
      const unsubscribe = query.subscribe(() => {});
      await vi.waitFor(() => {
        expect(query.getCurrentResult().data).toEqual(["initial"]);
      });

      const mutation = new MutationObserver(
        queryClient,
        trpc.post.create.mutationOptions({
          async onMutate(variables) {
            calls.push("onMutate");
            const queryKey = trpc.post.list.queryKey();
            await queryClient.cancelQueries({ queryKey });
            const previousData = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old) => [
              ...(old ?? []),
              variables.text,
            ]);
            return { previousData };
          },
          onError(_error, _variables, context) {
            calls.push("onError");
            queryClient.setQueryData(
              trpc.post.list.queryKey(),
              context?.previousData,
            );
          },
          async onSettled() {
            calls.push("onSettled");
            await queryClient.invalidateQueries(trpc.post.list.queryFilter());
          },
        }),
      );

      const mutating = mutation.mutate({ text: "optimistic" });
      await vi.waitFor(() => {
        expect(query.getCurrentResult().data).toEqual([
          "initial",
          "optimistic",
        ]);
      });
      await mutating;
      expect(query.getCurrentResult().data).toEqual(["initial", "optimistic"]);
      expect(calls).toEqual(["onMutate", "onSettled"]);
      unsubscribe();
    });

    it("uses proxy keyPrefix for mutationKey + defaults", async () => {
      await using ctx = testContext(keyPrefix);
      const trpc = ctx.optionsProxyClient;
      const calls: Array<string> = [];

      const expectedKey =
        keyPrefix == null
          ? [["post", "create"]]
          : [[keyPrefix], ["post", "create"]];

      ctx.queryClient.setMutationDefaults(expectedKey, {
        onSuccess() {
          calls.push("defaultOnSuccess");
        },
      });

      const options = trpc.post.create.mutationOptions();
      expect(options.mutationKey).toEqual(expectedKey);
      expect(trpc.post.create.mutationKey()).toEqual(expectedKey);

      const observer = new MutationObserver(ctx.queryClient, options);
      await expect(observer.mutate({ text: "hello" })).resolves.toBe(
        "__mutationResult",
      );
      expect(calls).toEqual(["defaultOnSuccess"]);
    });

    it("calls the router directly on a router proxy", async () => {
      await using ctx = testContext(keyPrefix);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const observer = new MutationObserver(
        ctx.queryClient,
        ctx.optionsProxyServer.post.createWithSerializable.mutationOptions(),
      );
      const result = await observer.mutate({ text: "hello" });
      const anyDate: unknown = expect.any(Date);
      expect(result).toEqual({ id: 1, text: "hello", date: anyDate });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("sends the `trpc` request context", async () => {
      await using ctx = testContext(keyPrefix);
      const context = { __TEST__: true };

      const observer = new MutationObserver(
        ctx.queryClient,
        ctx.optionsProxyClient.post.create.mutationOptions({
          trpc: { context },
        }),
      );
      await observer.mutate({ text: "hello" });
      expect(ctx.linkSpy.up.mock.calls[0]?.[0]).toMatchObject({
        type: "mutation",
        path: "post.create",
        context,
      });
    });
  },
);

describe("mutation overrides", () => {
  it("onSuccess override wraps the original onSuccess", async () => {
    const t = initTRPC.create({});
    const appRouter = t.router({
      create: t.procedure.mutation(() => "created" as const),
    });
    await using ctx = createServerResource(appRouter);
    const calls: Array<string> = [];

    const trpc = createTRPCOptionsProxy({
      client: ctx.client,
      queryClient: ctx.queryClient,
      overrides: {
        mutations: {
          async onSuccess(opts) {
            calls.push("before");
            await opts.originalFn();
            calls.push(`after:${String(opts.meta.tag)}`);
            expect(opts.queryClient).toBe(ctx.queryClient);
          },
        },
      },
    });

    const observer = new MutationObserver(
      ctx.queryClient,
      trpc.create.mutationOptions({
        meta: { tag: "x" },
        onSuccess() {
          calls.push("original");
        },
      }),
    );
    await observer.mutate();
    expect(calls).toEqual(["before", "original", "after:x"]);
  });
});
