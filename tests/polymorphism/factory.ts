import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TRPCOptionsProxy } from "#lib/index.js";
import { t } from "#tests/polymorphism/common.js";

const FileExportRequest = z.object({
  name: z.string().min(0),
  filter: z.string().min(0),
});

const FileExportStatus = z.object({
  id: z.number().min(0),
  name: z.string().min(0),
  downloadUri: z.string().optional(),
  createdAt: z.date(),
});
export type FileExportStatusType = z.infer<typeof FileExportStatus>;

export type DataProvider = Array<FileExportStatusType>;

const counter = { value: 1 };

export function createExportRoute<TBaseProcedure extends typeof t.procedure>(
  baseProcedure: TBaseProcedure,
  dataProvider: DataProvider,
) {
  return t.router({
    start: baseProcedure
      .input(FileExportRequest)
      .output(FileExportStatus)
      .mutation(async (opts) => {
        const exportInstance: FileExportStatusType = {
          id: counter.value++,
          name: opts.input.name,
          createdAt: new Date(),
          downloadUri: undefined,
        };
        dataProvider.push(exportInstance);
        return exportInstance;
      }),
    list: baseProcedure
      .output(z.array(FileExportStatus))
      .query(async () => dataProvider),
    status: baseProcedure
      .input(z.object({ id: z.number().min(0) }))
      .output(FileExportStatus)
      .query(async (opts) => {
        const index = dataProvider.findIndex(
          (item) => item.id === opts.input.id,
        );
        const exportInstance = dataProvider[index];
        if (exportInstance == null) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        dataProvider[index] = {
          ...exportInstance,
          downloadUri: `example.com/export-${exportInstance.name}.csv`,
        };
        return exportInstance;
      }),
  });
}

type ExportRouteType = ReturnType<typeof createExportRoute>;

export type ExportRouteLike = TRPCOptionsProxy<ExportRouteType>;
