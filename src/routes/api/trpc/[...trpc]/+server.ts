import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "#demo/router.js";
import type { RequestHandler } from "./$types";

const handler: RequestHandler = async ({ request }) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => ({}),
  });

export const GET = handler;
export const POST = handler;
