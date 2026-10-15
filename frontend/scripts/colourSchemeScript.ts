// frontend/scripts/colourSchemeScript.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import { transformWithOxc, type Plugin } from "vite";

/** Where the script is served from, by name, in dev and in the build. */
export const COLOUR_SCHEME_URL = "/colour-scheme.js";

/**
 * The colour scheme script, compiled on its own from TypeScript to a
 * plain script. Vite's own Oxc transform strips the types; nothing is
 * bundled, so the output is the source less its types.
 */
export async function compileColourScheme(source: string): Promise<string> {
  const code = readFileSync(source, "utf8");
  const result = await transformWithOxc(code, source, { lang: "ts" });

  return result.code;
}

/**
 * Serves `src/colour-scheme.ts` as `/colour-scheme.js` in dev, and writes
 * it to the build under that fixed name. index.html loads it as a classic
 * blocking script, which Vite's own handling of index.html scripts would
 * not give: it bundles only module scripts, and a module script may run
 * after the first paint.
 */
export function colourSchemeScript(source: string): Plugin {
  return {
    name: "colour-scheme-script",
    configureServer(server) {
      server.middlewares.use(COLOUR_SCHEME_URL, (req, res, next) => {
        const rest = (req.url ?? "").split("?")[0];
        if (rest !== "/" && rest !== "") {
          next();
          return;
        }

        compileColourScheme(source)
          .then((code) => {
            res.setHeader("Content-Type", "text/javascript");
            res.end(code);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: path.basename(COLOUR_SCHEME_URL),
        source: await compileColourScheme(source),
      });
    },
  };
}
