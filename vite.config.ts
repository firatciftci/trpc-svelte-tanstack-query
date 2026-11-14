import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      adapter: adapter(),
    }),
  ],
  test: {
    expect: { requireAssertions: true },
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "client",
          include: ["tests/**/*.svelte.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/**/*.svelte.test.ts"],
          typecheck: {
            enabled: true,
            include: ["tests/**/*.test-d.ts"],
            tsconfig: "./tsconfig.json",
          },
        },
      },
    ],
  },
});
