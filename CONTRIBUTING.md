# Contributing

Thanks for helping out. Bug reports, fixes, docs improvements, and new tests are all welcome. For a new feature or an API change, please open an issue first so we can agree on the shape before you write the code.

## Setup

You need the current Node.js LTS and pnpm, at the version pinned in `packageManager` in `package.json`.

```sh
git clone https://github.com/firatciftci/trpc-svelte-tanstack-query.git
cd trpc-svelte-tanstack-query
pnpm install
pnpm exec playwright install chromium chromium-headless-shell
```

The Playwright browsers are needed for the browser tests and the end-to-end tests.

## Scripts

| Command           | What it does                                                                         |
| ----------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`        | Runs the SvelteKit test app in `src/routes`, for trying changes by hand              |
| `pnpm check`      | Type checks the library, tests, and test app with `svelte-check`                     |
| `pnpm lint`       | Runs knip and ESLint                                                                 |
| `pnpm lint:fix`   | Runs knip and ESLint and applies their fixes                                         |
| `pnpm format`     | Checks formatting with oxfmt                                                         |
| `pnpm format:fix` | Formats every file with oxfmt                                                        |
| `pnpm test`       | Runs Vitest: component tests in headless Chromium, Node tests, and type tests        |
| `pnpm test:e2e`   | Builds the test app and runs the Playwright server-rendering tests against it        |
| `pnpm build`      | Packages the library into `dist` and checks it with publint and Are the Types Wrong? |

## Project layout

| Path                                            | Contents                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/lib`                                       | The library. `index.ts` is the main entry point, and `unstable-handles` is the experimental one           |
| `src/demo`, `src/routes`, `src/hooks.server.ts` | A small SvelteKit app that the end-to-end tests run against                                               |
| `tests`                                         | Vitest tests. Files ending in `.svelte.test.ts` run in the browser, and `.test-d.ts` files are type tests |
| `e2e`                                           | Playwright tests                                                                                          |

## Pull requests

- Keep each pull request to one change, and add or update tests for it. Most tests are ported from `@trpc/tanstack-react-query`, so a matching upstream test is a good starting point.
- Run `pnpm check`, `pnpm lint`, `pnpm format`, and `pnpm test` before you push. CI runs these, the build, the end-to-end tests, and the test suite against the lowest supported versions of tRPC and TanStack Svelte Query.
- Write the pull request title as a [Conventional Commit](https://www.conventionalcommits.org), such as `fix: keep the cursor when refetching`. Pull requests are squash-merged, and the title becomes the commit message and the changelog entry.
- This package follows the React package's API and behavior. If your change makes them differ, explain why in the pull request and add it to the "Coming from React" section of the README.

## Releasing

Maintainers release from `main`:

1. Run `pnpm release` and choose the version. It updates `package.json`, commits, tags, and pushes.
2. The tag starts the Release workflow, which builds the package and stages it on npm through trusted publishing, so no npm token is stored in the repository. It also writes the GitHub release notes from the commit history.
3. Approve the staged version on npmjs.com to publish it.
