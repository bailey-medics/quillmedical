import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Dev: map "/" -> "/index.html", "/features" -> "/features.html", "/docs/faq" -> "/docs/faq.html"
const devHtmlRewrite: Plugin = {
  name: "dev-html-rewrite",
  configureServer(server: ViteDevServer) {
    const SKIP_PREFIXES = [
      "/@vite/", // Vite client + HMR
      "/@react-refresh", // React refresh runtime
      "/@id/", // Vite module ids
      "/@fs/", // Vite file system imports
      "/node_modules/", // dev-served deps
      "/src/", // your TS/TSX modules
      "/assets/", // built assets (if any)
      "/favicon", // favicons
      "/__vite_ping", // Vite health check
    ];

    server.middlewares.use(
      (
        req: IncomingMessage,
        _res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        let url = (req.url ?? "").split("?")[0];

        // don't rewrite vite internals or anything that already looks like a file (has a dot)
        if (
          url === "/" ||
          (!url.includes(".") && !SKIP_PREFIXES.some((p) => url.startsWith(p)))
        ) {
          // "/" -> "/index.html", "/features" -> "/features.html", "/docs/faq" -> "/docs/faq.html"
          req.url = url === "/" ? "/index.html" : `${url}.html`;
        }

        next();
      }
    );
  },
};

// Build: collect every .html under this workspace (root + subfolders)
function collectHtmlInputs(): string[] | undefined {
  const rootDir = __dirname;
  const ignore = new Set([
    "node_modules",
    "dist",
    "src",
    "templates",
    "scripts",
    ".git",
    ".yarn",
  ]);
  const inputs: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name)) walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        inputs.push(full);
      }
    }
  };

  walk(rootDir);
  return inputs.length ? inputs : undefined;
}

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [
        path.resolve(__dirname, "../tsconfig.json"),
        path.resolve(__dirname, "tsconfig.json"),
      ],
    }),
    devHtmlRewrite,
  ],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "@components": path.resolve(__dirname, "../src/components"),
      "@utils": path.resolve(__dirname, "../.storybook/utils"),
      "@design": path.resolve(__dirname, "../src/design"),
      "@domains": path.resolve(__dirname, "../src/domains"),
    },
  },
  build: {
    outDir: "../../dist/public_pages",
    emptyOutDir: true,
    rollupOptions: {
      input: collectHtmlInputs(), // preserves subfolders in dist/
    },
  },
});
