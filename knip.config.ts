import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreFiles: ["changelogithub.config.ts"],
  ignoreIssues: {
    ".github/**/*.yml": ["binaries"],
    "tsconfig.json": ["unlisted"],
  },
};

export default config;
