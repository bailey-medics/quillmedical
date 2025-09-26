// CommonJS so it runs regardless of "type": "module"
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pagesDir = path.join(root, "src/pages");
const templatePath = path.join(root, "templates/page.html");

function titleFor(name) {
  if (name === "index") return "Quill Medical";
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && full.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

function relFromPages(abs) {
  return path.relative(pagesDir, abs).replace(/\\/g, "/"); // windows-safe
}

function buildOnce() {
  if (!fs.existsSync(pagesDir)) {
    console.error(`[pages:gen] ERROR: ${pagesDir} does not exist`);
    return;
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`[pages:gen] ERROR: template missing at ${templatePath}`);
    return;
  }

  const tpl = fs.readFileSync(templatePath, "utf8");
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

    const html = tpl
      .replace("<!--TITLE-->", titleFor(name))
      .replace(
        "<!--ENTRY-->",
        `<script type="module" src="/src/pages/${rel}"></script>`
      );

    let outPath;
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

if (process.argv.includes("--watch")) {
  buildOnce();
  fs.watch(pagesDir, { persistent: true }, (evt, filename) => {
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
} else {
  buildOnce();
}
