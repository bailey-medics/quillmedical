/**
 * The words of each guide, read from the markdown files in `content/`.
 *
 * Imported only by the guide page, so the files travel in the guides'
 * lazy chunk and not in first load. The registry beside this is the part
 * that first load holds.
 */

const files = import.meta.glob<string>("./content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const sources: ReadonlyMap<string, string> = new Map(
  Object.entries(files).map(([path, source]) => [
    path.replace(/^\.\/content\//, "").replace(/\.md$/, ""),
    source,
  ]),
);

/** The slug of every markdown file there is, registered or not. */
export const CONTENT_SLUGS: readonly string[] = [...sources.keys()].sort();

/** A file's `#` heading, which the registry's title has to match. */
export function guideHeading(slug: string): string | undefined {
  return sources
    .get(slug)
    ?.match(/^# (.+)$/m)?.[1]
    ?.trim();
}

/**
 * A guide's words without the `#` heading. The page shows the title in
 * its own header, and the heading stays in the file so that the file
 * reads as a document by itself.
 */
export function guideBody(slug: string): string | undefined {
  return sources
    .get(slug)
    ?.replace(/^# .+$/m, "")
    .trim();
}
