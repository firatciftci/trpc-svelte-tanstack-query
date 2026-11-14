import type { Handle } from "@sveltejs/kit/hooks";
import { createTRPCOptionsProxy } from "#lib/index.js";
import { createServerQueryClient } from "./demo/query-client.js";
import { appRouter } from "./demo/router.js";

export const handle: Handle = async ({ event, resolve }) => {
  const queryClient = createServerQueryClient();
  event.locals.queryClient = queryClient;
  event.locals.trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });
  return resolve(event);
};
