import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Minimal Vite config for the public_pages workspace
export default defineConfig({
  plugins: [
    // dev-only plugin: respond with 404.html for unknown HTML requests
    {
      name: "vite:dev-404",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            if (!req || req.method !== "GET") return next();
            const reqUrl = req.url || "/";
            // ignore vite internals and websockets
            if (
              reqUrl.startsWith("/@") ||
              reqUrl.startsWith("/__") ||
              reqUrl.startsWith("/sockjs")
            )
              return next();
            const parsed = new URL(reqUrl, "http://localhost");
            const pathname = decodeURIComponent(parsed.pathname);
            // allow root and index.html to continue
            if (pathname === "/" || pathname === "/index.html") return next();

            // check if the file exists on disk relative to server root
            const filePath = path.join(server.config.root, pathname);
            const exists = await fs.promises
              .stat(filePath)
              .then(() => true)
              .catch(() => false);
            if (exists) return next();

            // For HTML requests, serve 404.html with 404 status instead of index.html
            const accept = (req.headers &&
              (req.headers.accept || "")) as string;
            // treat as HTML if Accept explicitly wants HTML, accepts anything, or the path has no file extension
            const hasExt = path.extname(pathname) !== "";
            const isHtmlRequest =
              accept.includes("text/html") || accept.includes("*/*") || !hasExt;
            if (isHtmlRequest) {
              const fallback = path.join(server.config.root, "not-found.html");
              const has404 = await fs.promises
                .stat(fallback)
                .then(() => true)
                .catch(() => false);
              if (has404) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                const body = await fs.promises.readFile(fallback, "utf-8");
                res.end(body);
                return;
              }
              res.statusCode = 404;
              res.end("404 Not Found");
              return;
            }
          } catch (err) {
            // noop - fall through to default handling
          }
          return next();
        });
      },
    },
    react(),
    tsconfigPaths({
      projects: [
        path.resolve(__dirname, "../tsconfig.json"),
        path.resolve(__dirname, "tsconfig.json"),
      ],
    }),
  ],
  base: "/",
  build: {
    outDir: "../dist/public_pages",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
});
