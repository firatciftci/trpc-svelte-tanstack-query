import type { QueryClient } from "@tanstack/svelte-query";
import type { ComponentProps } from "svelte";
import { render } from "vitest-browser-svelte";
import Harness from "#tests/fixtures/harness.svelte";

type Setup = ComponentProps<typeof Harness>["setup"];

export async function mount(opts: {
  queryClient: QueryClient;
  provide: () => void;
  setup: Setup;
}) {
  return render(Harness, { props: opts });
}
