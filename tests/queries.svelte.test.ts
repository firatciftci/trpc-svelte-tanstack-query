import {
  createInfiniteQuery,
  createMutation,
  createQuery,
  QueryClient,
  skipToken,
  useQueryClient,
} from "@tanstack/svelte-query";
import { initTRPC } from "@trpc/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { z } from "zod";
import { createSubscription } from "#lib/index.js";
import { mount } from "#tests/fixtures/mount.js";
import Probe from "#tests/fixtures/probe.svelte";
import { createLocalResource } from "#tests/helpers/local.js";

type Post = { id: string; title: string };

function getCtx<TKeyPrefix extends string | undefined>(keyPrefix: TKeyPrefix) {
  let iterableDeferred = Promise.withResolvers<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = Promise.withResolvers<void>();
  };
  const aborted = { slow: 0, slowWithAbort: 0 };
  const t = initTRPC.create({ allowOutsideOfServer: true });
  const posts: Array<string> = ["initial"];
  const items = Array.from({ length: 5 }, (_, index) => ({
    id: index,
    title: `item ${index}`,
  }));

  const router = t.router({
    post: t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query(() => "__result" as const),
      title: t.procedure
        .input(z.object({ id: z.string() }))
        .query(({ input }) => `title ${input.id}`),
      list: t.procedure.query(() => [...posts]),
      all: t.procedure.query((): Array<Post> => [
        { id: "1", title: "Hello world" },
      ]),
      iterable: t.procedure.query(async function* () {
        for (let index = 0; index < 3; index++) {
          if (index > 0) {
            await iterableDeferred.promise;
          }
          yield index + 1;
        }
      }),
      create: t.procedure
        .input(z.object({ text: z.string() }))
        .mutation(({ input }) => {
          posts.push(input.text);
          return "__mutationResult" as const;
        }),
      fail: t.procedure.input(z.object({ text: z.string() })).mutation(() => {
        throw new Error("mutation failed");
      }),
    }),
    infinite: t.procedure
      .input(z.object({ limit: z.number(), cursor: z.number().nullish() }))
      .query(({ input }) => {
        const start = input.cursor ?? 0;
        const page = items.slice(start, start + input.limit);
        const next = start + input.limit;
        return { items: page, nextCursor: next < items.length ? next : null };
      }),
    slow: t.procedure.input(z.string()).query(async ({ input, signal }) => {
      let isSettled = false;
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => {
          if (!isSettled) {
            aborted[input === "abort" ? "slowWithAbort" : "slow"]++;
          }
          resolve();
        });
        setTimeout(resolve, 300);
      });
      isSettled = true;
      return input;
    }),
  });

  const resource = createLocalResource(router, { keyPrefix });
  const contextKeyPrefix: unknown = keyPrefix;
  return {
    ...resource,
    aborted,
    nextIterable,
    provide: () =>
      resource.setTRPCContext({
        trpcClient: resource.client,
        queryClient: resource.queryClient,
        keyPrefix: contextKeyPrefix as never,
      }),
  };
}

describe.each(["user-123", undefined])(
  "queries with keyPrefix: %s",
  (keyPrefix) => {
    it("createQuery with queryOptions", async () => {
      using ctx = getCtx(keyPrefix);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() =>
            trpc.post.byId.queryOptions({ id: "1" }),
          );
          expectTypeOf(query.data).toEqualTypeOf<"__result" | undefined>();
          return {
            view: () => ({
              data: query.data ?? "NO_DATA",
              path: trpc.post.byId.queryOptions({ id: "1" }).trpc.path,
            }),
          };
        },
      });

      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:__result");
      await expect
        .element(screen.getByTestId("path"))
        .toHaveTextContent("path:post.byId");
      const keys = ctx.queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey);
      const expected = [
        ["post", "byId"],
        { input: { id: "1" }, type: "query" },
      ];
      expect(keys).toEqual([
        keyPrefix == null ? expected : [[keyPrefix], ...expected],
      ]);
    });

    it("select", async () => {
      using ctx = getCtx(keyPrefix);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() =>
            trpc.post.byId.queryOptions(
              { id: "1" },
              { select: (data) => `mutated${data}` as const },
            ),
          );
          expectTypeOf(query.data).toEqualTypeOf<
            "mutated__result" | undefined
          >();
          return { view: () => ({ data: query.data ?? "NO_DATA" }) };
        },
      });

      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:mutated__result");
    });

    it("initialData", async () => {
      using ctx = getCtx(keyPrefix);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() =>
            trpc.post.byId.queryOptions(
              { id: "1" },
              { initialData: "__result" },
            ),
          );
          expectTypeOf(query.data).toEqualTypeOf<"__result">();
          return { view: () => ({ data: query.data }) };
        },
      });

      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:__result");
    });

    it("initialData inference with select", async () => {
      using ctx = getCtx(keyPrefix);
      const noPost = "NO_POST" as const;

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() =>
            trpc.post.all.queryOptions(undefined, {
              initialData: [],
              staleTime: Infinity,
              select: (data) => data[0] ?? noPost,
            }),
          );
          expectTypeOf(query.data).toEqualTypeOf<Post | "NO_POST">();
          return {
            view: () => ({
              title: query.data === noPost ? noPost : query.data.title,
            }),
          };
        },
      });

      await expect
        .element(screen.getByTestId("title"))
        .toHaveTextContent("title:NO_POST");
      await ctx.queryClient.invalidateQueries();
      await expect
        .element(screen.getByTestId("title"))
        .toHaveTextContent("title:Hello world");
    });

    it("reactive input refetches through the accessor", async () => {
      using ctx = getCtx(keyPrefix);
      let id = $state("1");

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() => trpc.post.title.queryOptions({ id }));
          return { view: () => ({ data: query.data ?? "NO_DATA" }) };
        },
      });

      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:title 1");
      id = "2";
      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:title 2");
      expect(ctx.queryClient.getQueryCache().getAll()).toHaveLength(2);
    });

    it("skipToken disables the query until an input is given", async () => {
      using ctx = getCtx(keyPrefix);
      let id = $state<string | undefined>(undefined);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() =>
            trpc.post.title.queryOptions(id == null ? skipToken : { id }),
          );
          return {
            view: () => ({
              status: query.status,
              fetchStatus: query.fetchStatus,
              data: query.data ?? "NO_DATA",
            }),
          };
        },
      });

      await expect
        .element(screen.getByTestId("status"))
        .toHaveTextContent("status:pending");
      await expect
        .element(screen.getByTestId("fetchStatus"))
        .toHaveTextContent("fetchStatus:idle");
      id = "3";
      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:title 3");
    });

    it("streams an iterable query", async () => {
      using ctx = getCtx(keyPrefix);
      const selects: Array<Array<number>> = [];

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createQuery(() =>
            trpc.post.iterable.queryOptions(undefined, {
              select: (data) => {
                selects.push(data);
                return data;
              },
            }),
          );
          expectTypeOf(query.data).toEqualTypeOf<Array<number> | undefined>();
          return {
            view: () => ({ data: query.data ?? [], status: query.fetchStatus }),
          };
        },
      });

      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:[1]");
      ctx.nextIterable();
      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:[1,2]");
      ctx.nextIterable();
      await expect
        .element(screen.getByTestId("data"))
        .toHaveTextContent("data:[1,2,3]");
      await expect
        .element(screen.getByTestId("status"))
        .toHaveTextContent("status:idle");
      expect(selects.at(-1)).toEqual([1, 2, 3]);
    });

    it("createInfiniteQuery with infiniteQueryOptions", async () => {
      using ctx = getCtx(keyPrefix);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createInfiniteQuery(() =>
            trpc.infinite.infiniteQueryOptions(
              { limit: 2 },
              { getNextPageParam: (lastPage) => lastPage.nextCursor },
            ),
          );
          expectTypeOf(query.data?.pageParams).toEqualTypeOf<
            Array<number | null> | undefined
          >();
          return {
            view: () => ({
              ids:
                query.data?.pages.flatMap((page) =>
                  page.items.map((item) => item.id),
                ) ?? [],
              hasNextPage: query.hasNextPage,
            }),
            actions: { next: () => void query.fetchNextPage() },
          };
        },
      });

      await expect
        .element(screen.getByTestId("ids"))
        .toHaveTextContent("ids:[0,1]");
      await screen.getByTestId("next").click();
      await expect
        .element(screen.getByTestId("ids"))
        .toHaveTextContent("ids:[0,1,2,3]");
      await screen.getByTestId("next").click();
      await expect
        .element(screen.getByTestId("ids"))
        .toHaveTextContent("ids:[0,1,2,3,4]");
      await expect
        .element(screen.getByTestId("hasNextPage"))
        .toHaveTextContent("hasNextPage:false");
      const [query] = ctx.queryClient.getQueryCache().getAll();
      const expected = [
        ["infinite"],
        { input: { limit: 2 }, type: "infinite" },
      ];
      expect(query?.queryKey).toEqual(
        keyPrefix == null ? expected : [[keyPrefix], ...expected],
      );
    });

    it("infinite query with a falsy initial cursor", async () => {
      using ctx = getCtx(keyPrefix);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const query = createInfiniteQuery(() =>
            trpc.infinite.infiniteQueryOptions(
              { limit: 3, cursor: 0 },
              { getNextPageParam: (lastPage) => lastPage.nextCursor },
            ),
          );
          return {
            view: () => ({
              ids:
                query.data?.pages.flatMap((page) =>
                  page.items.map((item) => item.id),
                ) ?? [],
              params: query.data?.pageParams ?? [],
            }),
            actions: { next: () => void query.fetchNextPage() },
          };
        },
      });

      await expect
        .element(screen.getByTestId("ids"))
        .toHaveTextContent("ids:[0,1,2]");
      await expect
        .element(screen.getByTestId("params"))
        .toHaveTextContent("params:[0]");
      await screen.getByTestId("next").click();
      await expect
        .element(screen.getByTestId("params"))
        .toHaveTextContent("params:[0,3]");
    });

    it("createMutation with mutationOptions", async () => {
      using ctx = getCtx(keyPrefix);
      const calls: Array<string> = [];

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const queryClient = useQueryClient();
          const list = createQuery(() => trpc.post.list.queryOptions());
          const mutation = createMutation(() =>
            trpc.post.create.mutationOptions({
              onSuccess: async (data) => {
                expectTypeOf(data).toEqualTypeOf<"__mutationResult">();
                calls.push("onSuccess");
                await queryClient.invalidateQueries(
                  trpc.post.list.queryFilter(),
                );
              },
            }),
          );
          return {
            view: () => ({
              list: list.data ?? [],
              result: mutation.data ?? "NO_RESULT",
            }),
            actions: { create: () => mutation.mutate({ text: "created" }) },
          };
        },
      });

      await expect
        .element(screen.getByTestId("list"))
        .toHaveTextContent('list:["initial"]');
      await screen.getByTestId("create").click();
      await expect
        .element(screen.getByTestId("result"))
        .toHaveTextContent("result:__mutationResult");
      await expect
        .element(screen.getByTestId("list"))
        .toHaveTextContent('list:["initial","created"]');
      expect(calls).toEqual(["onSuccess"]);
    });

    it("createMutation without options", async () => {
      using ctx = getCtx(keyPrefix);

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const mutation = createMutation(() =>
            trpc.post.create.mutationOptions(),
          );
          return {
            view: () => ({ result: mutation.data ?? "NO_RESULT" }),
            actions: { create: () => mutation.mutate({ text: "plain" }) },
          };
        },
      });

      await screen.getByTestId("create").click();
      await expect
        .element(screen.getByTestId("result"))
        .toHaveTextContent("result:__mutationResult");
    });

    it("optimistic update", async () => {
      using ctx = getCtx(keyPrefix);
      const calls: Array<string> = [];

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const queryClient = useQueryClient();
          const list = createQuery(() => trpc.post.list.queryOptions());
          const mutation = createMutation(() =>
            trpc.post.fail.mutationOptions({
              onMutate: async (variables) => {
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
              onError: (_error, _variables, context) => {
                calls.push("onError");
                queryClient.setQueryData(
                  trpc.post.list.queryKey(),
                  context?.previousData,
                );
              },
              onSettled: () => {
                calls.push("onSettled");
              },
            }),
          );
          return {
            view: () => ({ list: list.data ?? [], status: mutation.status }),
            actions: { create: () => mutation.mutate({ text: "optimistic" }) },
          };
        },
      });

      await expect
        .element(screen.getByTestId("list"))
        .toHaveTextContent('list:["initial"]');
      await screen.getByTestId("create").click();
      await expect
        .element(screen.getByTestId("status"))
        .toHaveTextContent("status:error");
      await expect
        .element(screen.getByTestId("list"))
        .toHaveTextContent('list:["initial"]');
      expect(calls).toEqual(["onMutate", "onError", "onSettled"]);
    });

    it("uses the context keyPrefix for the mutationKey and its defaults", async () => {
      using ctx = getCtx(keyPrefix);
      const calls: Array<string> = [];
      const expectedKey =
        keyPrefix == null
          ? [["post", "create"]]
          : [[keyPrefix], ["post", "create"]];
      ctx.queryClient.setMutationDefaults(expectedKey, {
        onSuccess: () => {
          calls.push("defaultOnSuccess");
        },
      });

      const screen = await mount({
        queryClient: ctx.queryClient,
        provide: ctx.provide,
        setup: () => {
          const trpc = ctx.useTRPC();
          const options = trpc.post.create.mutationOptions();
          const mutation = createMutation(() => options);
          return {
            view: () => ({
              key: options.mutationKey,
              result: mutation.data ?? "NO_RESULT",
            }),
            actions: { create: () => mutation.mutate({ text: "hello" }) },
          };
        },
      });

      await expect
        .element(screen.getByTestId("key"))
        .toHaveTextContent(`key:${JSON.stringify(expectedKey)}`);
      await screen.getByTestId("create").click();
      await expect
        .element(screen.getByTestId("result"))
        .toHaveTextContent("result:__mutationResult");
      expect(calls).toEqual(["defaultOnSuccess"]);
    });
  },
);

describe("abortOnUnmount", () => {
  it("aborts the request when the last observer is destroyed", async () => {
    using ctx = getCtx(undefined);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const query = createQuery(() =>
          trpc.slow.queryOptions("abort", { trpc: { abortOnUnmount: true } }),
        );
        return { view: () => ({ status: query.fetchStatus }) };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:fetching");
    await screen.unmount();
    await expect.poll(() => ctx.aborted.slowWithAbort).toBe(1);
  });

  it("keeps the request running without abortOnUnmount", async () => {
    using ctx = getCtx(undefined);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const query = createQuery(() => trpc.slow.queryOptions("keep"));
        return { view: () => ({ status: query.fetchStatus }) };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:fetching");
    await screen.unmount();
    await expect
      .poll(
        () =>
          ctx.queryClient.getQueryData(ctx.optionsProxy.slow.queryKey("keep")),
        { timeout: 2000 },
      )
      .toBe("keep");
    expect(ctx.aborted.slow).toBe(0);
  });
});

describe("context", () => {
  it("useTRPCClient returns the client", async () => {
    using ctx = getCtx(undefined);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const client = ctx.useTRPCClient();
        let fetched = $state("");
        return {
          view: () => ({ fetched: `Fetched: ${fetched}` }),
          actions: {
            fetch: () => {
              void client.post.byId.query({ id: "1" }).then((state) => {
                expectTypeOf(state).toEqualTypeOf<"__result">();
                fetched = state;
              });
            },
          },
        };
      },
    });

    await screen.getByTestId("fetch").click();
    await expect
      .element(screen.getByTestId("fetched"))
      .toHaveTextContent("fetched:Fetched: __result");
  });

  it("setTRPCContext defaults to the QueryClient from QueryClientProvider", async () => {
    using ctx = getCtx(undefined);
    let proxyQueryClient: unknown;

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: () => {
        const trpc = ctx.setTRPCContext({ trpcClient: ctx.client });
        proxyQueryClient = (
          Reflect.get(trpc, "~queryClient") as () => QueryClient
        )();
      },
      setup: () => {
        const trpc = ctx.useTRPC();
        const query = createQuery(() =>
          trpc.post.byId.queryOptions({ id: "1" }),
        );
        return { view: () => ({ data: query.data ?? "NO_DATA" }) };
      },
    });

    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:__result");
    expect(proxyQueryClient).toBe(ctx.queryClient);
  });

  it("useTRPC and useTRPCClient throw without setTRPCContext", async () => {
    using ctx = getCtx(undefined);
    const errors: Array<string> = [];

    await render(Probe, {
      props: {
        setup: () => {
          for (const read of [ctx.useTRPC, ctx.useTRPCClient]) {
            try {
              read();
            } catch (error) {
              errors.push(
                error instanceof Error ? error.message : String(error),
              );
            }
          }
          return { view: () => ({}) };
        },
      },
    });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^useTRPC\(\) can only be called/);
    expect(errors[1]).toMatch(/^useTRPCClient\(\) can only be called/);
  });

  it("multiple contexts with key prefixes", async () => {
    const t = initTRPC.create({ allowOutsideOfServer: true });
    const queryClient = new QueryClient();
    using billing = createLocalResource(
      t.router({ list: t.procedure.query(() => ["invoice 1"]) }),
      { keyPrefix: "billing", queryClient },
    );
    using account = createLocalResource(
      t.router({ list: t.procedure.query(() => ["account 1"]) }),
      { keyPrefix: "account", queryClient },
    );

    const screen = await mount({
      queryClient,
      provide: () => {
        billing.setTRPCContext({
          trpcClient: billing.client,
          queryClient,
          keyPrefix: "billing",
        });
        account.setTRPCContext({
          trpcClient: account.client,
          queryClient,
          keyPrefix: "account",
        });
      },
      setup: () => {
        const billingTRPC = billing.useTRPC();
        const accountTRPC = account.useTRPC();
        const billingList = createQuery(() => billingTRPC.list.queryOptions());
        const accountList = createQuery(() => accountTRPC.list.queryOptions());
        return {
          view: () => ({
            billing: `Billing: ${billingList.data?.join(", ") ?? ""}`,
            account: `Account: ${accountList.data?.join(", ") ?? ""}`,
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("billing"))
      .toHaveTextContent("billing:Billing: invoice 1");
    await expect
      .element(screen.getByTestId("account"))
      .toHaveTextContent("account:Account: account 1");
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([
      [["billing"], ["list"], { type: "query" }],
      [["account"], ["list"], { type: "query" }],
    ]);
  });

  it("createSubscription works through useTRPC with a local link", async () => {
    const t = initTRPC.create({ allowOutsideOfServer: true });
    using ctx = createLocalResource(
      t.router({
        count: t.procedure.input(z.number()).subscription(async function* ({
          input,
        }) {
          for (let index = 1; index <= input; index++) {
            yield index;
          }
        }),
      }),
    );
    const onData = vi.fn();

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: () => ctx.setTRPCContext({ trpcClient: ctx.client }),
      setup: () => {
        const trpc = ctx.useTRPC();
        const subscription = createSubscription(() =>
          trpc.count.subscriptionOptions(3, { onData }),
        );
        return { view: () => ({ status: subscription.status }) };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    expect(onData.mock.calls).toEqual([[1], [2], [3]]);
  });
});
