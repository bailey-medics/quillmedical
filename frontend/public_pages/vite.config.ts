import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import postcssPresetMantine from "postcss-preset-mantine";
import postcssSimpleVars from "postcss-simple-vars";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Minimal Vite config for the public_pages workspace
export default defineConfig({
  plugins: [
    // dev-only plugin: rewrite clean URLs and serve 404 for unknown routes
    {
      name: "vite:mpa-clean-urls",
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

            // check if the file exists on disk exactly as requested
            const fileExists = async (base: string, p: string) =>
              fs.promises
                .stat(path.join(base, p))
                .then(() => true)
                .catch(() => false);
            if (
              (await fileExists(server.config.root, pathname)) ||
              (typeof server.config.publicDir === "string" &&
                (await fileExists(server.config.publicDir, pathname)))
            )
              return next();

            // rewrite clean URL to .html variant (e.g. /about → /about.html)
            const htmlVariant = `${pathname.replace(/\/$/, "")}.html`;
            if (await fileExists(server.config.root, htmlVariant)) {
              req.url = htmlVariant + (parsed.search || "");
              return next();
            }

            // serve 404 page for unknown HTML requests
            const accept = (req.headers &&
              (req.headers.accept || "")) as string;
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
                const raw = await fs.promises.readFile(fallback, "utf-8");
                const html = await server.transformIndexHtml(
                  "/not-found.html",
                  raw,
                );
                res.statusCode = 404;
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.end(html);
                return;
              }
              res.statusCode = 404;
              res.end("404 Not Found");
              return;
            }
          } catch {
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
  publicDir: path.resolve(__dirname, "../public"),
  base: "/",
  appType: "mpa",
  build: {
    outDir: "../dist/public_pages",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        about: path.resolve(__dirname, "about.html"),
        careers: path.resolve(__dirname, "careers.html"),
        "clinical-messaging": path.resolve(
          __dirname,
          "clinical-messaging.html",
        ),
        "company-information": path.resolve(
          __dirname,
          "company-information.html",
        ),
        "clinical-teaching": path.resolve(__dirname, "clinical-teaching.html"),
        "competency-access": path.resolve(__dirname, "competency-access.html"),
        contact: path.resolve(__dirname, "contact.html"),
        "cookie-policy": path.resolve(__dirname, "cookie-policy.html"),
        "external-referrals": path.resolve(
          __dirname,
          "external-referrals.html",
        ),
        features: path.resolve(__dirname, "features.html"),
        "modular-deployment": path.resolve(
          __dirname,
          "modular-deployment.html",
        ),
        pricing: path.resolve(__dirname, "pricing.html"),
        "privacy-policy": path.resolve(__dirname, "privacy-policy.html"),
        "structured-records": path.resolve(
          __dirname,
          "structured-records.html",
        ),
        "terms-of-service": path.resolve(__dirname, "terms-of-service.html"),
        "not-found": path.resolve(__dirname, "not-found.html"),
        "storybook-test": path.resolve(__dirname, "storybook-test.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      // Force shared packages to resolve from the parent workspace so
      // components imported via @/ share the same React and Mantine
      // context as the page entry points (prevents dual-context errors).
      react: path.resolve(__dirname, "../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../node_modules/react-dom"),
      "@mantine/core": path.resolve(__dirname, "../node_modules/@mantine/core"),
      "@mantine/hooks": path.resolve(
        __dirname,
        "../node_modules/@mantine/hooks",
      ),
    },
  },
  css: {
    postcss: {
      plugins: [
        postcssPresetMantine(),
        postcssSimpleVars({
          variables: {
            "mantine-breakpoint-xs": "36em",
            "mantine-breakpoint-sm": "48em",
            "mantine-breakpoint-md": "62em",
            "mantine-breakpoint-lg": "75em",
            "mantine-breakpoint-xl": "88em",
          },
        }),
      ],
    },
  },
});
