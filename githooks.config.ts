import { defineGithooksConfig } from "@funish/githooks";

export default defineGithooksConfig({
  scripts: {
    "pre-commit": "pnpm lint-staged",
    "commit-msg": "pnpm commitlint --edit $1",
  },
});
