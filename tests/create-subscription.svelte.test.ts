import { QueryClient, skipToken } from "@tanstack/svelte-query";
import { createTRPCClient, localLink } from "@trpc/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { flushSync } from "svelte";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import type {
  FeatureFlags,
  TRPCConnectionState,
  TRPCSubscriptionOptionsOut,
  TRPCSubscriptionStatus,
} from "#lib/index.js";
import { createSubscription } from "#lib/index.js";
import { createEmitter } from "#tests/fixtures/emitter.js";
import { mount } from "#tests/fixtures/mount.js";
import { createLocalResource } from "#tests/helpers/local.js";

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getCtx() {
  const abortState: Record<number, "aborted"> = {};
  let yieldOnceThenListenCalls = 0;
  let failOnceCalls = 0;
  const gate = { wait: Promise.resolve() };
  const ee = createEmitter<number>();

  const t = initTRPC.create({
    allowOutsideOfServer: true,
    errorFormatter({ shape }) {
      return { ...shape, data: { ...shape.data, foo: "bar" as const } };
    },
  });

  const router = t.router({
    onEventIterable: t.procedure
      .input(z.number())
      .subscription(async function* (opts) {
        try {
          for await (const data of ee.on(opts.signal)) {
            yield data + opts.input;
          }
        } catch (error) {
          if (opts.signal?.aborted === true) {
            abortState[opts.input] = "aborted";
          }
          throw error;
        }
      }),
    yieldOnce: t.procedure
      .input(z.number())
      .subscription(async function* (opts) {
        yield opts.input;
      }),
    yieldOnceThenListen: t.procedure
      .use(async (opts) => {
        await gate.wait;
        return opts.next();
      })
      .input(z.number())
      .subscription(async function* (opts) {
        yieldOnceThenListenCalls++;
        if (yieldOnceThenListenCalls === 1) {
          yield opts.input;
          return;
        }
        for await (const data of ee.on(opts.signal)) {
          yield data + opts.input;
        }
      }),
    failOnce: t.procedure
      .input(z.number())
      .subscription(async function* (opts) {
        failOnceCalls++;
        for await (const data of ee.on(opts.signal)) {
          if (failOnceCalls === 1 && data < 0) {
            throw new Error("connection lost");
          }
          yield data + opts.input;
        }
      }),
    badRequest: t.procedure.subscription(async function* () {
      yield 1;
      throw new TRPCError({ code: "BAD_REQUEST", message: "bad request" });
    }),
  });

  const resource = createLocalResource(router);
  return {
    ...resource,
    ee,
    abortState,
    gate,
    provide: () => resource.setTRPCContext({ trpcClient: resource.client }),
  };
}

describe("createSubscription", () => {
  it("iterable", async () => {
    using ctx = getCtx();
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();
    let isEnabled = $state(true);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(10, {
            enabled: isEnabled,
            onData: (data) => {
              expectTypeOf(data).toEqualTypeOf<number>();
              onDataMock(data);
            },
            onError: onErrorMock,
          }),
        );
        return {
          view: () => ({
            status: result.status,
            error: result.error?.message,
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    expect(onDataMock).toHaveBeenCalledTimes(0);
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);

    ctx.ee.emit(20);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:30");
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledWith(30);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    isEnabled = false;
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(0);
    await expect.poll(() => ctx.abortState).toEqual({ 10: "aborted" });

    ctx.ee.emit(40);
    await sleep(10);
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });

  it("starts in connecting, then pending", async () => {
    using ctx = getCtx();
    const statuses: Array<TRPCSubscriptionStatus> = [];

    await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(1),
        );
        statuses.push(result.status);
        $effect(() => {
          statuses.push(result.status);
        });
        return { view: () => ({ status: result.status }) };
      },
    });

    await expect.poll(() => statuses.at(-1)).toBe("pending");
    expect(statuses[0]).toBe("connecting");
  });

  it("server ends the subscription", async () => {
    using ctx = getCtx();
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();
    const onCompleteMock = vi.fn();
    const statuses: Array<TRPCSubscriptionStatus> = [];

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.yieldOnce.subscriptionOptions(10, {
            onData: onDataMock,
            onError: onErrorMock,
            onComplete: onCompleteMock,
          }),
        );
        $effect.pre(() => {
          statuses.push(result.status);
        });
        return {
          view: () => ({
            status: result.status,
            error: result.error?.message ?? "NO_ERROR",
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledWith(10);
    expect(onErrorMock).toHaveBeenCalledTimes(0);
    await expect.poll(() => onCompleteMock).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByTestId("error"))
      .toHaveTextContent("error:NO_ERROR");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");
    expect(statuses[0]).toBe("connecting");
    expect(statuses.at(-1)).toBe("idle");
    expect(statuses.filter((status) => status === "idle")).toHaveLength(1);

    await screen.unmount();
  });

  it("onComplete is not called when the client unsubscribes", async () => {
    using ctx = getCtx();
    let reset = () => {};
    const onCompleteMock = vi.fn(() => reset());
    let input = $state(10);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(input, {
            onComplete: onCompleteMock,
          }),
        );
        reset = result.reset;
        return {
          view: () => ({
            status: result.status,
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);

    input = 20;
    await expect.poll(() => ctx.abortState).toEqual({ 10: "aborted" });
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(1);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:21");

    await screen.unmount();

    await expect.poll(() => ctx.ee.listenerCount()).toBe(0);
    await sleep(20);
    expect(ctx.ee.listenerCount()).toBe(0);
    expect(onCompleteMock).toHaveBeenCalledTimes(0);
    expect(ctx.abortState).toEqual({ 10: "aborted", 20: "aborted" });
  });

  it("reset() inside onComplete restarts the subscription", async () => {
    using ctx = getCtx();
    const contextState = { calls: 0, wait: Promise.resolve() };
    const trpcClient = createTRPCClient<typeof ctx.router>({
      links: [
        localLink({
          router: ctx.router,
          createContext: async () => {
            contextState.calls++;
            await contextState.wait;
            return {};
          },
        }),
      ],
    });
    let releaseContext = () => {};
    let reset = () => {};
    const onDataMock = vi.fn();
    const onCompleteMock = vi.fn(() => {
      if (onCompleteMock.mock.calls.length !== 1) {
        return;
      }

      const held = Promise.withResolvers<void>();
      contextState.wait = held.promise;
      releaseContext = held.resolve;
      reset();
    });

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: () => ctx.setTRPCContext({ trpcClient }),
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.yieldOnce.subscriptionOptions(10, {
            onData: onDataMock,
            onComplete: onCompleteMock,
          }),
        );
        reset = result.reset;
        return { view: () => ({ status: result.status }) };
      },
    });

    await expect.poll(() => onCompleteMock).toHaveBeenCalledTimes(1);
    expect(contextState.calls).toBe(2);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
    await sleep(20);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");

    releaseContext();

    await expect.poll(() => onCompleteMock).toHaveBeenCalledTimes(2);
    expect(onDataMock).toHaveBeenCalledTimes(2);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");

    await screen.unmount();
  });

  it("reset() restarts the subscription from a held middleware", async () => {
    using ctx = getCtx();
    let releaseGate = () => {};
    let reset = () => {};
    const onCompleteMock = vi.fn(() => {
      if (onCompleteMock.mock.calls.length !== 1) {
        return;
      }

      const held = Promise.withResolvers<void>();
      ctx.gate.wait = held.promise;
      releaseGate = held.resolve;
      reset();
    });

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.yieldOnceThenListen.subscriptionOptions(10, {
            onComplete: onCompleteMock,
          }),
        );
        reset = result.reset;
        return {
          view: () => ({
            status: result.status,
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect.poll(() => onCompleteMock).toHaveBeenCalledTimes(1);
    await sleep(20);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");

    releaseGate();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);

    ctx.ee.emit(20);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:30");

    await screen.unmount();
    await expect.poll(() => ctx.ee.listenerCount()).toBe(0);
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });

  it("connection state: reconnects after a retryable error", async () => {
    using ctx = getCtx();
    const states: Array<TRPCConnectionState<unknown>["state"]> = [];
    const snapshots: Array<{
      status: TRPCSubscriptionStatus;
      data: unknown;
      error: unknown;
    }> = [];

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.failOnce.subscriptionOptions(10, {
            onConnectionStateChange: (state) => {
              states.push(state.state);
            },
          }),
        );
        $effect(() => {
          snapshots.push({
            status: result.status,
            data: result.data,
            error: result.error?.message ?? null,
          });
        });
        return {
          view: () => ({
            status: result.status,
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(20);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:30");
    expect(snapshots[0]).toEqual({
      status: "connecting",
      data: undefined,
      error: null,
    });
    expect(snapshots.at(-1)).toEqual({
      status: "pending",
      data: 30,
      error: null,
    });

    snapshots.length = 0;
    ctx.ee.emit(-1);

    await expect.poll(() => states).toContain("connecting");
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    expect(
      snapshots.some(
        (it) =>
          it.status === "connecting" &&
          it.error === "connection lost" &&
          it.data === 30,
      ),
    ).toBe(true);
    expect(snapshots.at(-1)).toEqual({
      status: "pending",
      data: 30,
      error: null,
    });

    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(40);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:50");
    expect(states[0]).toBe("connecting");
    expect(states).toContain("pending");

    await screen.unmount();
  });

  it("an error stops the subscription with the formatted error", async () => {
    using ctx = getCtx();
    const onErrorMock = vi.fn();

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.badRequest.subscriptionOptions(undefined, {
            onError: onErrorMock,
          }),
        );
        if (result.status === "error") {
          expectTypeOf(result.error.data?.foo).toEqualTypeOf<
            "bar" | undefined
          >();
        }
        return {
          view: () => ({
            status: result.status,
            error: result.error?.message ?? "NO_ERROR",
            code: result.error?.data?.code ?? "NO_CODE",
            foo: result.error?.data?.foo ?? "NO_FOO",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:error");
    await expect
      .element(screen.getByTestId("error"))
      .toHaveTextContent("error:bad request");
    await expect
      .element(screen.getByTestId("code"))
      .toHaveTextContent("code:BAD_REQUEST");
    await expect
      .element(screen.getByTestId("foo"))
      .toHaveTextContent("foo:bar");
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  it("aborts on restarts", async () => {
    using ctx = getCtx();
    let input = $state(1);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(input),
        );
        return {
          view: () => ({
            status: result.status,
            error: result.error?.message,
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(10);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:11");

    input = 2;
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(10);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:12");
    await expect.poll(() => ctx.abortState).toEqual({ 1: "aborted" });

    await screen.unmount();
    await expect
      .poll(() => ctx.abortState)
      .toEqual({ 1: "aborted", 2: "aborted" });
  });

  it("reset()", async () => {
    using ctx = getCtx();
    const snapshots: Array<{ status: TRPCSubscriptionStatus; data: unknown }> =
      [];

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(10),
        );
        $effect(() => {
          snapshots.push({ status: result.status, data: result.data });
        });
        return {
          view: () => ({
            status: result.status,
            data: result.data ?? "NO_DATA",
          }),
          actions: { reset: result.reset },
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(20);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:30");

    snapshots.length = 0;
    await screen.getByTestId("reset").click();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    expect(snapshots[0]).toEqual({ status: "connecting", data: undefined });
    expect(snapshots.at(-1)).toEqual({ status: "pending", data: undefined });
    await expect.poll(() => ctx.abortState).toEqual({ 10: "aborted" });
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);

    await screen.unmount();
  });

  it("two subscriptions with the same input", async () => {
    using ctx = getCtx();

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const first = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(10),
        );
        const second = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(10),
        );
        return {
          view: () => ({
            status1: first.status,
            status2: second.status,
            data: first.data == null ? "NONE" : (second.data ?? "NONE"),
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status1"))
      .toHaveTextContent("status1:pending");
    await expect
      .element(screen.getByTestId("status2"))
      .toHaveTextContent("status2:pending");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NONE");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(2);
    ctx.ee.emit(20);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:30");

    await screen.unmount();
    await expect.poll(() => ctx.ee.listenerCount()).toBe(0);
  });

  it("skipToken input stays idle until an input is given", async () => {
    using ctx = getCtx();
    let input = $state<number | typeof skipToken>(skipToken);

    const screen = await mount({
      queryClient: ctx.queryClient,
      provide: ctx.provide,
      setup: () => {
        const trpc = ctx.useTRPC();
        const result = createSubscription(() =>
          trpc.onEventIterable.subscriptionOptions(input),
        );
        return {
          view: () => ({
            status: result.status,
            data: result.data ?? "NO_DATA",
          }),
        };
      },
    });

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    await sleep(10);
    expect(ctx.ee.listenerCount()).toBe(0);

    input = 5;
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(1);
    ctx.ee.emit(1);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:6");

    input = skipToken;
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    await expect.poll(() => ctx.ee.listenerCount()).toBe(0);
  });
});

type Callbacks = Parameters<
  TRPCSubscriptionOptionsOut<number, Error, FeatureFlags>["subscribe"]
>[0];

function createFakeSubscription() {
  const subscriptions: Array<{
    callbacks: Callbacks;
    unsubscribe: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    subscriptions,
    latest: () => {
      const subscription = subscriptions.at(-1);
      if (subscription == null) {
        throw new Error("no subscription");
      }
      return subscription;
    },
    options(
      input: number,
      overrides: Partial<
        Omit<
          TRPCSubscriptionOptionsOut<number, Error, FeatureFlags>,
          "subscribe" | "queryKey"
        >
      > = {},
    ): TRPCSubscriptionOptionsOut<number, Error, FeatureFlags> {
      return {
        enabled: true,
        ...overrides,
        queryKey: [["fake"], { input }],
        trpc: { path: "fake" },
        subscribe: (callbacks) => {
          const unsubscribe = vi.fn();
          subscriptions.push({ callbacks, unsubscribe });
          return { unsubscribe };
        },
      };
    },
  };
}

describe("createSubscription state machine", () => {
  async function mountFake(
    getOptions: () => TRPCSubscriptionOptionsOut<number, Error, FeatureFlags>,
  ) {
    let reset = () => {};
    const screen = await mount({
      queryClient: new QueryClient(),
      provide: () => {},
      setup: () => {
        const result = createSubscription(getOptions);
        reset = result.reset;
        return {
          view: () => ({
            status: result.status,
            data: result.data ?? "NO_DATA",
            error: result.error?.message ?? "NO_ERROR",
          }),
        };
      },
    });
    return { screen, reset: () => reset() };
  }

  it("walks through every status", async () => {
    const fake = createFakeSubscription();
    const onStarted = vi.fn();
    const onData = vi.fn();
    const onError = vi.fn();
    const onConnectionStateChange = vi.fn();
    const { screen } = await mountFake(() =>
      fake.options(1, { onStarted, onData, onError, onConnectionStateChange }),
    );

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
    expect(fake.subscriptions).toHaveLength(1);

    fake.latest().callbacks.onStarted?.();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    expect(onStarted).toHaveBeenCalledTimes(1);

    fake.latest().callbacks.onData?.(7);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:7");
    expect(onData).toHaveBeenCalledWith(7);

    fake
      .latest()
      .callbacks.onConnectionStateChange?.({
        type: "state",
        state: "connecting",
        error: new Error("lost"),
      });
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
    await expect
      .element(screen.getByTestId("error"))
      .toHaveTextContent("error:lost");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:7");

    fake
      .latest()
      .callbacks.onConnectionStateChange?.({
        type: "state",
        state: "pending",
        error: null,
      });
    await sleep(5);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");

    fake.latest().callbacks.onStarted?.();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    await expect
      .element(screen.getByTestId("error"))
      .toHaveTextContent("error:NO_ERROR");

    fake.latest().callbacks.onError?.(new Error("failed"));
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:error");
    await expect
      .element(screen.getByTestId("error"))
      .toHaveTextContent("error:failed");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:7");
    expect(onError).toHaveBeenCalledTimes(1);

    fake
      .latest()
      .callbacks.onConnectionStateChange?.({
        type: "state",
        state: "idle",
        error: null,
      });
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");
    expect(onConnectionStateChange).toHaveBeenCalledTimes(3);
  });

  it("onStopped and onComplete move to idle once", async () => {
    const fake = createFakeSubscription();
    const onStopped = vi.fn();
    const onComplete = vi.fn();
    const { screen } = await mountFake(() =>
      fake.options(1, { onStopped, onComplete }),
    );

    fake.latest().callbacks.onStarted?.();
    fake.latest().callbacks.onData?.(3);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:3");

    fake.latest().callbacks.onStopped?.();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");
    fake.latest().callbacks.onComplete?.();
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reset() inside onStopped restarts the subscription", async () => {
    const fake = createFakeSubscription();
    let resetRef = () => {};
    const onStopped = vi.fn(() => {
      if (onStopped.mock.calls.length === 1) {
        resetRef();
      }
    });
    const { screen, reset } = await mountFake(() =>
      fake.options(1, { onStopped }),
    );
    resetRef = reset;

    fake.latest().callbacks.onStarted?.();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
    const first = fake.latest();
    first.callbacks.onStopped?.();

    expect(fake.subscriptions).toHaveLength(2);
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");

    first.callbacks.onComplete?.();
    await sleep(5);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");

    fake.latest().callbacks.onStarted?.();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:pending");
  });

  it("callbacks read the latest options without resubscribing", async () => {
    const fake = createFakeSubscription();
    const seen: Array<string> = [];
    let label = $state("a");
    await mountFake(() =>
      fake.options(1, {
        onData: (data) => {
          seen.push(`${label}${data}`);
        },
      }),
    );

    fake.latest().callbacks.onData?.(1);
    label = "b";
    flushSync();
    fake.latest().callbacks.onData?.(2);

    expect(seen).toEqual(["a1", "b2"]);
    expect(fake.subscriptions).toHaveLength(1);
  });

  it("resubscribes when the key changes, not when only callbacks change", async () => {
    const fake = createFakeSubscription();
    let input = $state(1);
    let counter = $state(0);
    const { screen } = await mountFake(() =>
      fake.options(input, { onData: () => counter }),
    );

    expect(fake.subscriptions).toHaveLength(1);
    counter = 1;
    flushSync();
    expect(fake.subscriptions).toHaveLength(1);

    fake.latest().callbacks.onStarted?.();
    fake.latest().callbacks.onData?.(9);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:9");

    const first = fake.latest();
    input = 2;
    flushSync();
    expect(fake.subscriptions).toHaveLength(2);
    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");

    first.callbacks.onComplete?.();
    first.callbacks.onStopped?.();
    await sleep(5);
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
  });

  it("toggling enabled unsubscribes, resets to idle, and resubscribes", async () => {
    const fake = createFakeSubscription();
    let isEnabled = $state(false);
    const { screen } = await mountFake(() =>
      fake.options(1, { enabled: isEnabled }),
    );

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    expect(fake.subscriptions).toHaveLength(0);

    isEnabled = true;
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
    expect(fake.subscriptions).toHaveLength(1);
    fake.latest().callbacks.onStarted?.();
    fake.latest().callbacks.onData?.(4);
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:4");

    isEnabled = false;
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    await expect
      .element(screen.getByTestId("data"))
      .toHaveTextContent("data:NO_DATA");
    expect(fake.latest().unsubscribe).toHaveBeenCalledTimes(1);

    isEnabled = true;
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:connecting");
    expect(fake.subscriptions).toHaveLength(2);
  });

  it("reset() while disabled stays idle without subscribing", async () => {
    const fake = createFakeSubscription();
    const { screen, reset } = await mountFake(() =>
      fake.options(1, { enabled: false }),
    );

    reset();
    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("status:idle");
    expect(fake.subscriptions).toHaveLength(0);
  });

  it("destroying the component unsubscribes and ignores later callbacks", async () => {
    const fake = createFakeSubscription();
    const onStopped = vi.fn();
    const onComplete = vi.fn();
    const { screen } = await mountFake(() =>
      fake.options(1, { onStopped, onComplete }),
    );

    const subscription = fake.latest();
    await screen.unmount();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);

    subscription.callbacks.onStopped?.();
    subscription.callbacks.onComplete?.();
    expect(onStopped).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
