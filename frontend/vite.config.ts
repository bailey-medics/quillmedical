import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  base: "/",
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
