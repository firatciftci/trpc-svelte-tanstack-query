import type { QueryClient } from "@tanstack/svelte-query";
import type { TRPCOptionsProxy } from "#lib/index.js";
import type { AppRouter } from "./demo/router.js";

declare global {
  namespace App {
    interface Locals {
      queryClient: QueryClient;
      trpc: TRPCOptionsProxy<AppRouter>;
    }
  }
}

export {};
