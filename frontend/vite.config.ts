import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  // When the SPA is served under the `/app/` path by the reverse proxy
  // we must set the Vite `base` so asset URLs and HTML references are
  // emitted under `/app/`. The Caddy `handle_path /app/*` directive strips
  // `/app` before proxying, so requests from the browser must still use
  // `/app/...` paths to be routed back through Caddy.
  base: "/app/",
  plugins: [react(), tsconfigPaths()],
});
