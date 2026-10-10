// Storybook test-runner Jest config, ejected so the dark-mode
// accessibility pass can be added as a setup file. The reason it is not a
// .storybook/test-runner.ts hook is in .storybook/a11y-dark-mode.ts.
import { fileURLToPath } from "node:url";
import { getJestConfig } from "@storybook/test-runner";
import { storybookMaxWorkers } from "./scripts/storybookWorkers.ts";

const testRunnerConfig = getJestConfig();

// Each worker drives a full Chromium, so a machine that is also running
// Docker wants fewer of them than jest would choose. SB_MAX_WORKERS in the
// root .env sets the cap; a --maxWorkers on the command line still wins.
const maxWorkers = storybookMaxWorkers(
  process.env.SB_MAX_WORKERS,
  fileURLToPath(new URL("../.env", import.meta.url)),
);

/** @type {import('@jest/types').Config.InitialOptions} */
export default {
  ...testRunnerConfig,
  ...(maxWorkers === undefined ? {} : { maxWorkers }),
  setupFilesAfterEnv: [
    ...(testRunnerConfig.setupFilesAfterEnv ?? []),
    // Absolute: the runner sets rootDir to the repository root, not here.
    fileURLToPath(new URL("./.storybook/a11y-dark-mode.ts", import.meta.url)),
  ],
};
