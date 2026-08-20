import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";
import { computeRequiredClientGeneration } from "./scripts/computeCompatGeneration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Baked in at build time from the repo-root api-compatibility/ decision
// files — must always match the backend's REQUIRED_CLIENT_GENERATION,
// since both are built from the same commit. See
// frontend/src/lib/compat-generation/compatGeneration.ts.
const COMPAT_GENERATION = computeRequiredClientGeneration(
  path.resolve(__dirname, "..", "api-compatibility"),
);

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  define: {
    __COMPAT_GENERATION__: JSON.stringify(COMPAT_GENERATION),
  },
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: false, // use existing manifest.webmanifest in public/
      injectManifest: {
        globPatterns: [
          "quill-logo*.png",
          "quill-name*.png",
          "android-chrome-*.png",
          "apple-touch-icon.png",
          "favicon*.{ico,png}",
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
