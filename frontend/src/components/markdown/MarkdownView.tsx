import type { ReactNode } from "react";
import { useMemo } from "react";
import DOMPurify from "dompurify";

type Props = {
  source: string;
  asPlainText?: boolean; // if true, return plain text instead of HTML
  className?: string;
  onLinkClick?: (href: string) => void;
  children?: ReactNode;
};

// Narrow, explicit allowlist for rendered HTML
const ALLOWED_TAGS = [
  "a",
  "strong",
  "em",
  "code",
  "pre",
  "p",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];
const ALLOWED_ATTR = ["href", "rel", "target"];

// SSR/Node safety checks
const CAN_USE_DOM =
  typeof window !== "undefined" && typeof document !== "undefined";

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Ensure hrefs are safe (allow http/https/mailto/tel/relative/#)
function isSafeUrl(raw: string): boolean {
  try {
    // Allow fragments (#foo) and protocol-relative/relative
    if (
      raw.startsWith("#") ||
      raw.startsWith("/") ||
      raw.startsWith("./") ||
      raw.startsWith("../")
    ) {
      return true;
    }
    const u = new URL(raw);
    return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol);
  } catch {
    // Try treating as relative
    try {
      // Base needed for relative URL parsing

      new URL(raw, "https://example.com/");
      return true;
    } catch {
      return false;
    }
  }
}

// Escape attribute values (we already escape HTML content)
function escapeAttr(str: string) {
  return str
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineFormat(raw: string) {
  // operate on escaped input
  let s = escapeHtml(raw);

  // links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const trimmedUrl = url.trim();
    const safe = isSafeUrl(trimmedUrl) ? trimmedUrl : "#";
    // text is already escaped by the initial escapeHtml
    const href = escapeAttr(safe);
    return `<a href="${href}" rel="noopener noreferrer nofollow">${text}</a>`;
  });

  // bold **text** or __text__
  s = s.replace(/(\*\*|__)(.*?)\1/g, "<strong>$2</strong>");

  // italic *text* or _text_
  s = s.replace(/(\*|_)(.*?)\1/g, "<em>$2</em>");

  // inline code `code`
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  return s;
}

function mdToHtml(src: string) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) {
      out.push("");
      i++;
      continue;
    }

    // code fence
    if (/^```/.test(line)) {
      let code = "";
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code += lines[i] + "\n";
        i++;
      }
      out.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      if (i < lines.length) i++;
      continue;
    }

    // headers (safe: avoid adjacent quantified regex parts)
    const hashes = line.match(/^(#{1,6})/);
    if (hashes) {
      const level = hashes[1].length;
      // slice off the hashes, then trim the remaining header text
      const text = line.slice(hashes[0].length).trim();
      out.push(`<h${level}>${inlineFormat(text)}</h${level}>`);
      i++;
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      const lis = items.map((it) => `<li>${inlineFormat(it)}</li>`).join("");
      out.push(`<ul>${lis}</ul>`);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      const lis = items.map((it) => `<li>${inlineFormat(it)}</li>`).join("");
      out.push(`<ol>${lis}</ol>`);
      continue;
    }

    // paragraph (gobble until blank)
    let para = line;
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i])) {
      para += " " + lines[i].trim();
      i++;
    }
    out.push(`<p>${inlineFormat(para)}</p>`);
  }

  return out.join("\n");
}

function toPlainText(src: string) {
  // convert to HTML then strip tags safely
  const html = mdToHtml(src);

  if (CAN_USE_DOM) {
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [], // strip everything to text
      ALLOWED_ATTR: [],
    });
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, "text/html");
    return doc.body.textContent || "";
  }
  // fallback: very simple tag strip + minimal entity decode
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
}

export default function MarkdownView({
  source,
  asPlainText = false,
  className,
  onLinkClick,
  children,
}: Props) {
  // 1) Render markdown to HTML
  const rawHtml = useMemo(() => {
    if (asPlainText) return toPlainText(source);
    return mdToHtml(source);
  }, [source, asPlainText]);

  // 2) Sanitize final HTML before any injection
  const sanitizedHtml = useMemo(() => {
    if (asPlainText) return rawHtml;
    if (!CAN_USE_DOM) {
      // SSR: safest is to return plain text rather than unsanitized HTML
      return rawHtml.replace(/<[^>]+>/g, "");
    }
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // optional: explicitly forbid event handlers just in case
      FORBID_ATTR: [/^on/i],
    });
  }, [rawHtml, asPlainText]);

  function handleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === "A") {
      const href = (target as HTMLAnchorElement).getAttribute("href") || "";
      if (onLinkClick) {
        e.preventDefault();
        onLinkClick(href);
      }
    }
  }

  if (asPlainText) {
    return (
      <div className={className}>
        <pre style={{ whiteSpace: "pre-wrap" }}>{rawHtml}</pre>
        {children}
      </div>
    );
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      // eslint-disable-next-line react/no-danger -- Sanitised via DOMPurify with strict ALLOWED_TAGS/ATTR above.
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
