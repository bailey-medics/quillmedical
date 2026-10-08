import react from "@vitejs/plugin-react-swc";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";
import { computeRequiredClientGeneration } from "./scripts/computeCompatGeneration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Baked in at build time from the repo-root api-compatibility/ decision
// files - must always match the backend's REQUIRED_CLIENT_GENERATION,
// since both are built from the same commit. See
// frontend/src/lib/compat-generation/compatGeneration.ts.
const COMPAT_GENERATION = computeRequiredClientGeneration(
  path.resolve(__dirname, "..", "api-compatibility"),
);

// Baked in at build time so an error report says which build produced it.
// Cloud Error Reporting groups on serviceContext.version, which is what
// separates a fault in the current deploy from one in a tab left open across
// two of them. The environment variable takes precedence so a build without
// the git history - a Docker build from a copied tree - can still be
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

// pdf.js decodes two image formats found in scanned PDFs, JBIG2 and
// JPEG 2000, with code it loads only when a document needs it, from a
// folder it is told about (`wasmUrl` in src/lib/pdf/openPdf.ts). It asks
// for each file by a fixed name, so they cannot go through the bundler,
// which would add a hash. This serves the two plain JavaScript decoders
// under `pdfjs/`, from the installed package, in dev and in the build.
//
// The WebAssembly decoders beside them are deliberately left out: the
// content security policy refuses to compile WebAssembly, and openPdf.ts
// says why that is not being loosened.
const PDFJS_DECODERS = [
  "jbig2_nowasm_fallback.js",
  "openjpeg_nowasm_fallback.js",
];

function pdfjsDecoders(): Plugin {
  const dir = path.resolve(__dirname, "node_modules/pdfjs-dist/wasm");
  return {
    name: "pdfjs-decoders",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const name = (req.url ?? "").split("?")[0].replace(/^\//, "");
        if (!PDFJS_DECODERS.includes(name)) {
          next();
          return;
        }
        res.setHeader("Content-Type", "text/javascript");
        res.end(readFileSync(path.join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of PDFJS_DECODERS) {
        this.emitFile({
          type: "asset",
          fileName: `pdfjs/${name}`,
          source: readFileSync(path.join(dir, name)),
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  build: {
    // Writes dist/.vite/manifest.json: for each source module that starts
    // a chunk, the file it was built into and the files that one imports.
    // The app reads it at run time to learn the names of the feature
    // chunks, so it can fetch them into the browser's cache in the
    // background without importing them. See lib/prefetchFeatures.ts.
    manifest: true,
    rollupOptions: {
      output: {
        // Keep function names through minification, so an error report names
        // `ErrorFallback` rather than `bj`. Without it a production stack is
        // entirely mangled identifiers and says nothing about this
        // application - see the reports from the /boom verification.
        //
        // Measured on this app: 892,697 bytes gzipped without, 930,826 with.
        // That is 37 KB, or 4.3%, paid on every fresh load and nothing on a
        // repeat visit, since the service worker holds the bundle.
        //
        // This is the permanent answer, not a stopgap. Source maps would be
        // better - the original file and line as well as the name, and no
        // download cost, since the browser never receives them - but they
        // have been deliberately deferred: the cost is the private bucket,
        // the retention policy, the upload step, the resolver and the rule
        // that a map is never served, all against a fault rate in single
        // figures. See "Not building, and what would change that" in
        // docs/docs/plans/2026-08-31-analytics-plan.md. If that decision is
        // revisited, this can go and the 37 KB comes back.
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
    pdfjsDecoders(),
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
