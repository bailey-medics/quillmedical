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
    server.middlewares.use(
      (
        req: IncomingMessage,
        _res: ServerResponse,
        next: (err?: unknown) => void
      ) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === "/") req.url = "/index.html";
        else if (/^\/[^.]+$/.test(url)) req.url = `${url}.html`; // no dot → add .html
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
