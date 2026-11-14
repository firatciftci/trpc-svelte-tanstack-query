import { QueryClient } from "@tanstack/svelte-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTRPCOptionsProxy } from "#lib/index.js";
import { createServerResource } from "#tests/helpers/server.js";

describe("pathSeparator", () => {
  it("query keys keep their shape and URLs use the separator", async () => {
    const t = initTRPC.create({ pathSeparator: "~" });
    const router = t.router({
      post: {
        byId: t.procedure
          .input(z.object({ id: z.number() }))
          .query((opts) => opts.input),
        add: t.procedure.input(z.string()).mutation((opts) => opts.input),
      },
      "flat.key": t.procedure.query(() => "flat"),
    });

    await using ctx = createServerResource(router);
    const urls: Array<string> = [];
    const client = createTRPCClient<typeof router>({
      links: [
        httpLink({
          url: ctx.httpUrl,
          pathSeparator: "~",
          fetch: async (url, init) => {
            urls.push(new URL(url instanceof Request ? url.url : url).pathname);
            return fetch(url, init);
          },
        }),
      ],
    });
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });

    expect(trpc.post.byId.queryKey({ id: 1 })).toEqual([
      ["post", "byId"],
      { input: { id: 1 }, type: "query" },
    ]);
    expect(trpc.post.add.mutationKey()).toEqual([["post", "add"]]);
    expect(trpc["flat.key"].queryKey()).toEqual([
      ["flat", "key"],
      { type: "query" },
    ]);

    expect(
      await queryClient.fetchQuery(trpc.post.byId.queryOptions({ id: 1 })),
    ).toEqual({ id: 1 });
    expect(await queryClient.fetchQuery(trpc["flat.key"].queryOptions())).toBe(
      "flat",
    );
    expect(urls).toEqual(["/post~byId", "/flat~key"]);
  });
});
