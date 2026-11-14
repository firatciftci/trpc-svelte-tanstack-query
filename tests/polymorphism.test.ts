import type { QueryClient } from "@tanstack/svelte-query";
import { MutationObserver, QueryObserver } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import type { inferOutput } from "#lib/index.js";
import type * as Factory from "#tests/polymorphism/factory.js";
import { createServerResource } from "#tests/helpers/server.js";
import { createTRPCApi } from "#tests/polymorphism/api.js";

async function startExport(
  queryClient: QueryClient,
  route: Factory.ExportRouteLike,
  onExportStarted: (id: number) => void,
) {
  const observer = new MutationObserver(
    queryClient,
    route.start.mutationOptions({
      async onSuccess(data) {
        onExportStarted(data.id);
        await queryClient.invalidateQueries(route.pathFilter());
      },
    }),
  );
  return observer.mutate({
    filter: "polymorphism svelte",
    name: "Search for Polymorphism Svelte",
  });
}

function exportStatus<TStatus extends Factory.ExportRouteLike["status"]>(
  queryClient: QueryClient,
  status: TStatus,
  currentExport: () => number | null,
) {
  const observer = new QueryObserver(
    queryClient,
    status.queryOptions(
      { id: currentExport() ?? -1 },
      { enabled: currentExport() !== null },
    ),
  );
  const unsubscribe = observer.subscribe(() => {});
  const label = () => {
    const data: inferOutput<TStatus> | undefined =
      observer.getCurrentResult().data;
    if (data == null) {
      return null;
    }
    return `Last Export: \`${data.name}\` (${data.downloadUri == null ? "Working" : "Ready!"})`;
  };
  return { observer, unsubscribe, label };
}

function exportsList(
  queryClient: QueryClient,
  list: Omit<Factory.ExportRouteLike["list"], "nothing">,
) {
  const observer = new QueryObserver(queryClient, list.queryOptions());
  const unsubscribe = observer.subscribe(() => {});
  return { observer, unsubscribe };
}

describe("polymorphism", () => {
  function testContext() {
    return createServerResource(createTRPCApi().appRouter);
  }

  describe("simple factory", () => {
    it("can use a simple factory router with an abstract interface", async () => {
      await using ctx = testContext();
      const trpc = ctx.optionsProxyClient;
      const { queryClient } = ctx;

      let currentExport: number | null = null;
      await startExport(queryClient, trpc.github.issues.export, (id) => {
        currentExport = id;
      });

      const status = exportStatus(
        queryClient,
        trpc.github.issues.export.status,
        () => currentExport,
      );
      const list = exportsList(queryClient, trpc.github.issues.export.list);
      await vi.waitFor(() => {
        expect(status.label()).toBe(
          "Last Export: `Search for Polymorphism Svelte` (Working)",
        );
      });

      await queryClient.invalidateQueries(trpc.github.pathFilter());
      await vi.waitFor(() => {
        expect(status.label()).toBe(
          "Last Export: `Search for Polymorphism Svelte` (Ready!)",
        );
      });
      expect(list.observer.getCurrentResult().data?.[0]?.downloadUri).toBe(
        "example.com/export-Search for Polymorphism Svelte.csv",
      );
      status.unsubscribe();
      list.unsubscribe();
    });

    it("can use the abstract interface with a factory instance merged with extra procedures", async () => {
      await using ctx = testContext();
      const trpc = ctx.optionsProxyClient;
      const { queryClient } = ctx;

      let currentExport: number | null = null;
      await startExport(queryClient, trpc.github.discussions.export, (id) => {
        currentExport = id;
      });

      const status = exportStatus(
        queryClient,
        trpc.github.discussions.export.status,
        () => currentExport,
      );
      await vi.waitFor(() => {
        expect(status.label()).toBe(
          "Last Export: `Search for Polymorphism Svelte` (Working)",
        );
      });

      await queryClient.invalidateQueries(trpc.github.pathFilter());
      await vi.waitFor(() => {
        expect(status.label()).toBe(
          "Last Export: `Search for Polymorphism Svelte` (Ready!)",
        );
      });

      const extra = new MutationObserver(
        queryClient,
        trpc.github.discussions.export.someExtraProcedure.mutationOptions(),
      );
      await expect(extra.mutate({ name: "world" })).resolves.toBe(
        "Hello world",
      );
      status.unsubscribe();
    });
  });
});
