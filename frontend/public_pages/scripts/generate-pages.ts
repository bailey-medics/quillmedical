// TypeScript run directly by Node, which strips the types (Node 24 does
// so by default), so it needs no build step and no tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** One page's entry in page-meta.json. */
export interface PageMeta {
  title?: string;
  description?: string;
}

/** What goes in a page's <title> and meta description, escaped. */
export interface PageHead {
  title: string;
  description: string;
}

const root = path.resolve(import.meta.dirname, "..");
const pagesDir = path.join(root, "src/pages");
const templatePath = path.join(root, "templates/page.html");
const metaPath = path.join(root, "page-meta.json");

const SITE_TITLE = "Quill Medical";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The <title> and meta description for one page, from page-meta.json.
 *
 * Every page must have an entry: a title made up from the file name
 * ("Clinical Records") is in title case, says nothing to a search engine,
 * and was how every page came to share one description. So a missing entry
 * stops the build rather than falling back.
 *
 * The title follows the GOV.UK pattern the app uses, "Page - Quill
 * Medical", most specific part first, except on the home page, which is
 * the site name alone.
 */
export function headFor(
  name: string,
  meta: Record<string, PageMeta | undefined>,
): PageHead {
  const entry = meta[name];
  if (!entry || !entry.title || !entry.description) {
    throw new Error(
      `[pages:gen] page-meta.json has no title and description for "${name}"`,
    );
  }
  const title =
    entry.title === SITE_TITLE ? SITE_TITLE : `${entry.title} - ${SITE_TITLE}`;
  return {
    title: escapeHtml(title),
    description: escapeHtml(entry.description),
  };
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && full.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

function relFromPages(abs: string): string {
  return path.relative(pagesDir, abs).replace(/\\/g, "/"); // windows-safe
}

function buildOnce(): void {
  if (!fs.existsSync(pagesDir)) {
    console.error(`[pages:gen] ERROR: ${pagesDir} does not exist`);
    return;
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`[pages:gen] ERROR: template missing at ${templatePath}`);
    return;
  }

  const tpl = fs.readFileSync(templatePath, "utf8");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<
    string,
    PageMeta | undefined
  >;
  const files = walk(pagesDir);
  if (files.length === 0) {
    console.warn("[pages:gen] No *.tsx pages found in src/pages");
    return;
  }

  for (const abs of files) {
    const rel = relFromPages(abs); // e.g. "index.tsx" or "docs/faq.tsx"
    const parsed = path.parse(rel);
    const name = parsed.name; // "index" or "faq"
    const subdir = parsed.dir; // "" or "docs"

    const head = headFor(name, meta);
    const html = tpl
      .replace("<!--TITLE-->", head.title)
      .replace("<!--DESCRIPTION-->", head.description)
      .replace(
        "<!--ENTRY-->",
        `<script type="module" src="/src/pages/${rel}"></script>`,
      );

    let outPath: string;
    if (rel === "index.tsx") {
      outPath = path.join(root, "index.html");
    } else if (!subdir) {
      outPath = path.join(root, `${name}.html`); // top-level alongside index
    } else {
      outPath = path.join(root, subdir, `${name}.html`); // nested: keep subfolders
      ensureDir(path.dirname(outPath));
    }

    fs.writeFileSync(outPath, html);
    console.log(`✔ wrote ${path.relative(root, outPath)}`);
  }
}

// Only generate when run as a script, not when a test imports headFor.
const runAsScript = process.argv[1] === fileURLToPath(import.meta.url);

if (runAsScript && process.argv.includes("--watch")) {
  buildOnce();
  fs.watch(pagesDir, { persistent: true }, (_event, filename) => {
    if (filename && filename.endsWith(".tsx")) {
      try {
        buildOnce();
      } catch (e) {
        console.error(e);
      }
    }
  });
  console.log(`[pages:gen] watching ${pagesDir} …`);
  process.stdin.resume();
} else if (runAsScript) {
  buildOnce();
}
