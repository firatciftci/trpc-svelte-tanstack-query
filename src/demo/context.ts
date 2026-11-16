import type { TRPCOptionsProxy } from "#lib/index.js";
import { createTRPCContext } from "#lib/index.js";
import type { AppRouter } from "./router.js";

export type TRPC = TRPCOptionsProxy<AppRouter>;

export const { setTRPCContext, useTRPC } = createTRPCContext<AppRouter>();
