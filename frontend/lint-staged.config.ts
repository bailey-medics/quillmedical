/**
 * What the pre-commit hook runs on the staged frontend files.
 *
 * A file rather than a block in package.json, because the type check has
 * to be a function: given file names, tsc checks only those files and
 * ignores tsconfig, so the function drops them and checks the whole
 * frontend instead. It runs once per commit, after ESLint and Prettier
 * have finished rewriting, so it reads what is actually committed.
 *
 * tsconfig.check.json keeps what was checked last time, in a cache file
 * of its own, so a later commit redoes only what changed. It cannot
 * share the one it would inherit, which belongs to the app build and
 * covers a different set of files.
 *
 * Only the main app is checked here. `yarn typecheck:all`, in CI, also
 * checks the Node config, the public pages and the tools.
 */
import type { Configuration } from "lint-staged";

const config: Configuration = {
  "*.{ts,tsx,js,jsx}": [
    "eslint --fix --max-warnings=0",
    "prettier --write",
    () => "yarn typecheck",
  ],
  "*.{css,scss}": ["stylelint --fix", "prettier --write"],
  "*.{md,mdx,json,html,yml,yaml}": ["prettier --write"],
};

export default config;
