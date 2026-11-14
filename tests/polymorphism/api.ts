import { z } from "zod";
import { t } from "#tests/polymorphism/common.js";
import * as Factory from "#tests/polymorphism/factory.js";

export function createTRPCApi() {
  const issueExportsProvider: Array<Factory.FileExportStatusType> = [];
  const discussionExportsProvider: Array<Factory.FileExportStatusType> = [];

  const appRouter = t.router({
    github: t.router({
      issues: t.router({
        export: Factory.createExportRoute(t.procedure, issueExportsProvider),
      }),
      discussions: t.router({
        export: t.mergeRouters(
          Factory.createExportRoute(t.procedure, discussionExportsProvider),
          t.router({
            someExtraProcedure: t.procedure
              .input(z.object({ name: z.string().min(0) }))
              .mutation((opts) => `Hello ${opts.input.name}`),
          }),
        ),
      }),
    }),
  });

  return { appRouter, issueExportsProvider, discussionExportsProvider };
}
