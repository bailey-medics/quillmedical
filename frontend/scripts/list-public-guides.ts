/**
 * Prints the slug of every guide marked `public`, one to a line.
 *
 * The screenshot workflow keeps the pictures of signed-in guides out of
 * the public bucket, and this is how it learns which guides are which:
 * from the registry itself, so a guide's pictures are public for the one
 * reason its words are. See `.github/scripts/guide-screenshots/upload-to-gcs.sh`.
 *
 * Type-checked by `tsconfig.check.json` and left out of
 * `tsconfig.node.json`, which checks the other scripts: the registry it
 * imports uses the `@/` path aliases, and the node project has none, so
 * `tsc -b` failed the production build there.
 *
 * Usage, from `frontend/`:
 *     npx tsx scripts/list-public-guides.ts > public/guide-assets/public-guides.txt
 */

import { GUIDES } from "../src/guides/registry";

for (const guide of GUIDES) {
  if (guide.public) console.log(guide.slug);
}
