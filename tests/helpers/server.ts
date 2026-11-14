import type {
  CreateTRPCClientOptions,
  Operation,
  TRPCLink,
} from "@trpc/client";
import type { AnyTRPCRouter } from "@trpc/server";
import type { CreateHTTPHandlerOptions } from "@trpc/server/adapters/standalone";
import type { AddressInfo, Socket } from "node:net";
import { QueryClient } from "@tanstack/svelte-query";
import {
  createTRPCClient,
  createWSClient,
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  wsLink,
} from "@trpc/client";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { EventSource } from "eventsource";
import http from "node:http";
import { vi } from "vitest";
import { WebSocketServer } from "ws";
import type { FeatureFlags } from "#lib/index.js";
import { createTRPCOptionsProxy } from "#lib/index.js";

type ClientLink =
  | "httpBatchLink"
  | "httpBatchStreamLink"
  | "httpLink"
  | "httpSubscriptionLink"
  | "wsLink";

type Flags<TKeyPrefix extends string | undefined> = undefined extends TKeyPrefix
  ? { keyPrefix: false }
  : { keyPrefix: true };

export function createServerResource<
  TRouter extends AnyTRPCRouter,
  TKeyPrefix extends string | undefined = undefined,
>(
  router: TRouter,
  opts?: {
    keyPrefix?: TKeyPrefix;
    clientLink?: ClientLink;
    server?: Partial<CreateHTTPHandlerOptions<TRouter>>;
    queryClient?: QueryClient;
    client?: Partial<CreateTRPCClientOptions<TRouter>>;
  },
) {
  const onErrorSpy = vi.fn();
  const onReqAborted = vi.fn();
  const handler = createHTTPHandler({
    router,
    ...opts?.server,
    onError(error) {
      onErrorSpy(error);
    },
    async createContext(context) {
      context.req.on("aborted", onReqAborted);
      return opts?.server?.createContext?.(context) ?? context;
    },
  });

  const httpServer = http.createServer(handler);
  const connections = new Set<Socket>();
  httpServer.on("connection", (connection) => {
    connections.add(connection);
    connection.once("close", () => connections.delete(connection));
  });
  httpServer.listen(0);
  const httpUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;

  const wss = new WebSocketServer({ port: 0 });
  const wssHandler = applyWSSHandler({
    wss,
    router,
    createContext: (context) => context,
  });
  const wssUrl = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  const wsClient = createWSClient({
    url: wssUrl,
    lazy: { enabled: true, closeMs: 0 },
  });

  const transformer = router._def._config.transformer as never;
  const links = {
    httpLink: httpLink({ url: httpUrl, transformer }),
    httpBatchLink: httpBatchLink({ url: httpUrl, transformer }),
    httpBatchStreamLink: httpBatchStreamLink({ url: httpUrl, transformer }),
    httpSubscriptionLink: httpSubscriptionLink({
      url: httpUrl,
      transformer,
      EventSource,
    }),
    wsLink: wsLink({ client: wsClient, transformer }),
  } satisfies Record<ClientLink, TRPCLink<TRouter>>;

  const linkSpy = { up: vi.fn<(op: Operation) => void>() };

  const client = createTRPCClient<TRouter>({
    links: [
      () =>
        ({ op, next }) => {
          linkSpy.up(op);
          return next(op);
        },
      opts?.clientLink == null
        ? splitLink({
            condition: (op) => op.context.ws === true,
            true: links.wsLink,
            false: splitLink({
              condition: (op) => op.type === "subscription",
              true: links.httpSubscriptionLink,
              false: splitLink({
                condition: (op) => op.context.batch === false,
                true: links.httpLink,
                false: splitLink({
                  condition: (op) => op.context.stream === false,
                  true: links.httpBatchLink,
                  false: links.httpBatchStreamLink,
                }),
              }),
            }),
          })
        : links[opts.clientLink],
    ],
    ...opts?.client,
  });

  const queryClient = opts?.queryClient ?? new QueryClient();
  const keyPrefix = opts?.keyPrefix as never;

  const optionsProxyClient = createTRPCOptionsProxy<
    TRouter,
    Flags<TKeyPrefix> & FeatureFlags
  >({ client: getUntypedClient(client), queryClient, keyPrefix });

  const optionsProxyServer = createTRPCOptionsProxy<
    TRouter,
    Flags<TKeyPrefix> & FeatureFlags
  >({ router, ctx: {}, queryClient, keyPrefix });

  const destroyConnections = () => {
    for (const socket of wss.clients) {
      socket.close();
    }
    for (const connection of connections) {
      connection.destroy();
    }
  };

  return {
    router,
    client,
    wsClient,
    queryClient,
    httpUrl,
    wssUrl,
    onErrorSpy,
    onReqAborted,
    linkSpy,
    connections,
    destroyConnections,
    optionsProxyClient,
    optionsProxyServer,
    async [Symbol.asyncDispose]() {
      queryClient.clear();
      void wsClient.close().catch(() => null);
      wssHandler.broadcastReconnectNotification();
      destroyConnections();
      await Promise.all([
        new Promise((resolve) => httpServer.close(resolve)),
        new Promise((resolve) => wss.close(resolve)),
      ]);
    },
  };
}
