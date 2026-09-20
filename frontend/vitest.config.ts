import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: ["tsconfig.check.json"] })],
  // Fixed test value for the compat-generation build constant, decoupled
  // from the real api-compatibility/ folder's current state so unrelated
  // tests stay deterministic regardless of what's merged there. See
  // vite.config.ts for the real build-time computation and
  // src/lib/compat-generation/compatGeneration.ts for the runtime usage.
  define: {
    __COMPAT_GENERATION__: "1",
    // Likewise fixed: the real value is the git revision, which would make
    // any test asserting on it fail on the next commit.
    __APP_VERSION__: '"test"',
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Vitest defaults to 5000ms, which was never a decision here — it is
    // simply what came out of the box, and it is marginal for the tests
    // that drive a form through `userEvent`. Those type a character at a
    // time and re-render on each one, so a test that takes two seconds
    // alone can take six when twenty-odd files are competing for the
    // same cores inside the test container. The symptom is a timeout on
    // a test that passes in isolation, which reads as a broken test and
    // is not one — `InviteAssessorForm` started failing when unrelated
    // files were added to the same run.
    //
    // Fifteen seconds still catches a genuinely stuck test; it only
    // stops a busy machine being reported as a bug.
    testTimeout: 15000,
    css: true,
    exclude: ["node_modules", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/types/",
        "**/*.d.ts",
        ".storybook/",
        "public_pages/",
      ],
    },
  },
});
