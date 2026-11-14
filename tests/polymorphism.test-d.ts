import { describe, expectTypeOf, test } from "vitest";
import type { inferInput, inferOutput, TRPCOptionsProxy } from "#lib/index.js";
import type { createTRPCApi } from "#tests/polymorphism/api.js";
import type * as Factory from "#tests/polymorphism/factory.js";

type AppRouter = ReturnType<typeof createTRPCApi>["appRouter"];
declare const trpc: TRPCOptionsProxy<AppRouter>;

describe("polymorphism types", () => {
  test("concrete routes are assignable to the abstract interface", () => {
    expectTypeOf(trpc.github.issues.export).toExtend<Factory.ExportRouteLike>();
    expectTypeOf(
      trpc.github.discussions.export,
    ).toExtend<Factory.ExportRouteLike>();
  });

  test("inferInput and inferOutput read a procedure's types", () => {
    expectTypeOf<
      inferOutput<Factory.ExportRouteLike["status"]>
    >().toEqualTypeOf<{
      id: number;
      name: string;
      downloadUri?: string | undefined;
      createdAt: string;
    }>();
    expectTypeOf<
      inferInput<Factory.ExportRouteLike["status"]>
    >().toEqualTypeOf<{ id: number }>();
    expectTypeOf<inferInput<Factory.ExportRouteLike["start"]>>().toEqualTypeOf<{
      name: string;
      filter: string;
    }>();
  });
});
