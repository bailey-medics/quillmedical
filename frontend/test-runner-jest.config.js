// Storybook test-runner Jest config, ejected so the dark-mode
// accessibility pass can be added as a setup file. The reason it is not a
// .storybook/test-runner.ts hook is in .storybook/a11y-dark-mode.ts.
import { fileURLToPath } from "node:url";
import { getJestConfig } from "@storybook/test-runner";

const testRunnerConfig = getJestConfig();

/** @type {import('@jest/types').Config.InitialOptions} */
export default {
  ...testRunnerConfig,
  setupFilesAfterEnv: [
    ...(testRunnerConfig.setupFilesAfterEnv ?? []),
    // Absolute: the runner sets rootDir to the repository root, not here.
    fileURLToPath(new URL("./.storybook/a11y-dark-mode.ts", import.meta.url)),
  ],
};
