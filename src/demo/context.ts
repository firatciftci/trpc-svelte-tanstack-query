import { createTRPCContext } from "#lib/index.js";
import type { AppRouter } from "./router.js";

export const { setTRPCContext, useTRPC } = createTRPCContext<AppRouter>();
