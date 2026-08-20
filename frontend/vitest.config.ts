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
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
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
