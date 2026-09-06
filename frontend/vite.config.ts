import react from "@vitejs/plugin-react-swc";
import { execSync } from "child_process";
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

// Baked in at build time so an error report says which build produced it.
// Cloud Error Reporting groups on serviceContext.version, which is what
// separates a fault in the current deploy from one in a tab left open across
// two of them. The environment variable takes precedence so a build without
// the git history — a Docker build from a copied tree — can still be
// identified; "dev" is the honest answer when neither is available.
//
// The full revision rather than the short one, so a local build and a deployed
// one are the same shape. deploy.yml passes the full form, which is also the
// container image tag, so a version read off an error report pastes straight
// into the tag that produced it.
const APP_VERSION: string =
  process.env["VITE_APP_VERSION"] ??
  (() => {
    try {
      return execSync("git rev-parse HEAD", {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      return "dev";
    }
  })();

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      output: {
        // Keep function names through minification, so an error report names
        // `ErrorFallback` rather than `bj`. Without it a production stack is
        // entirely mangled identifiers and says nothing about this
        // application — see the reports from the /boom verification.
        //
        // Measured on this app: 892,697 bytes gzipped without, 930,826 with.
        // That is 37 KB, or 4.3%, paid on every fresh load and nothing on a
        // repeat visit, since the service worker holds the bundle.
        //
        // TEMPORARY, in the sense that source maps supersede it entirely:
        // they give the original file and line as well as the name, and cost
        // nothing to download because the browser never receives them. Remove
        // this when they land, and take the 37 KB back — the plan ties the
        // two together so it does not quietly persist after it stops earning
        // anything.
        //
        // Note the option is `build.rollupOptions.output.keepNames`, not
        // `esbuild.keepNames`. Vite 8 minifies with Oxc, so the esbuild
        // option is silently ignored: setting it produces a byte-identical
        // bundle, which looks exactly like "no measurable cost" if you do not
        // check whether the names actually survived.
        keepNames: true,
      },
    },
  },
  define: {
    __COMPAT_GENERATION__: JSON.stringify(COMPAT_GENERATION),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
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
