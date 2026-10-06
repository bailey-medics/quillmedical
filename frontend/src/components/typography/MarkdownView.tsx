/**
 * Markdown View Component Module
 *
 * Safe markdown-to-HTML renderer with XSS protection using DOMPurify.
 * Supports rich text formatting (bold, italic, lists, links, code blocks)
 * with strict allowlist of HTML tags. Styled to match the app typography
 * system via CSS module. Used for clinical letters and messages.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { Skeleton, Stack } from "@mantine/core";
import classes from "./MarkdownView.module.css";

/**
 * MarkdownView Props
 */
type Props = {
  /** Markdown source text to render */
  source: string;
  /** If true, return plain text instead of HTML */
  asPlainText?: boolean;
  /** CSS class name for styling */
  className?: string;
  /** Callback when link is clicked (for custom handling) */
  onLinkClick?: (href: string) => void;
  /** Optional child content */
  children?: ReactNode;
  /** Whether markdown is currently loading */
  isLoading?: boolean;
  /**
   * Allow images, and where they live. Off unless given: letters and
   * messages are written by people Quill does not control, and an image
   * there would fetch from wherever its author pointed it.
   *
   * With a base, `![The form](add-a-delegate/form.png)` becomes an image
   * at `<imageBase>/add-a-delegate/form.png`. The address has to be that
   * shape (lower case words, hyphens and slashes, ending in an image
   * type), so it can only ever point beneath the base. Anything else, and
   * any image with no alt text, is left out.
   *
   * An image may also follow a list item, indented beneath it, so a
   * numbered step can carry its screenshot without ending the list.
   */
  imageBase?: string;
};

/**
 * Allowed HTML tags for markdown rendering.
 * Narrow, explicit allowlist for security (XSS protection).
 */
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
// Added to the lists above only when the caller gives an `imageBase`.
const IMAGE_TAGS = ["img"];
const IMAGE_ATTR = ["src", "alt", "loading"];

/** An image address a guide may use: beneath the base, and nowhere else. */
const IMAGE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(png|jpe?g|webp)$/;

/** An image on a line of its own, indented under the list item it shows. */
const IMAGE_UNDER_ITEM = /^\s{2,}!\[[^\]]*\]\([^)]+\)\s*$/;

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

function inlineFormat(raw: string, imageBase?: string) {
  // operate on escaped input
  let s = escapeHtml(raw);

  // images: ![alt](path). Taken out first, since an image is a link with
  // a mark in front of it, and put back last, so the bold and italic
  // passes below never see the address or the alt text.
  const images: string[] = [];
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, path) => {
    const trimmedPath = String(path).trim();
    const trimmedAlt = String(alt).trim();
    if (!imageBase || !trimmedAlt || !IMAGE_PATH.test(trimmedPath)) return "";
    const src = escapeAttr(`${imageBase.replace(/\/+$/, "")}/${trimmedPath}`);
    images.push(
      `<img src="${src}" alt="${escapeAttr(trimmedAlt)}" loading="lazy">`,
    );
    return `\u0000${images.length - 1}\u0000`;
  });

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

  // eslint-disable-next-line no-control-regex -- the marker put in above
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, index) => images[Number(index)]);

  return s;
}

function mdToHtml(src: string, imageBase?: string) {
  // The lines of one list, each item with any image indented beneath it.
  const isImageUnderItem = (line: string | undefined) =>
    imageBase !== undefined &&
    line !== undefined &&
    IMAGE_UNDER_ITEM.test(line);

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
        let item = lines[i].replace(/^\s*[-*]\s+/, "");
        i++;
        while (isImageUnderItem(lines[i])) {
          item += ` ${lines[i].trim()}`;
          i++;
        }
        items.push(item);
      }
      const lis = items
        .map((it) => `<li>${inlineFormat(it, imageBase)}</li>`)
        .join("");
      out.push(`<ul>${lis}</ul>`);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*\d+\.\s+/, "");
        i++;
        while (isImageUnderItem(lines[i])) {
          item += ` ${lines[i].trim()}`;
          i++;
        }
        items.push(item);
      }
      const lis = items
        .map((it) => `<li>${inlineFormat(it, imageBase)}</li>`)
        .join("");
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
    out.push(`<p>${inlineFormat(para, imageBase)}</p>`);
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
  isLoading = false,
  imageBase,
}: Props) {
  // 1) Render markdown to HTML
  const rawHtml = useMemo(() => {
    if (asPlainText) return toPlainText(source);
    return mdToHtml(source, imageBase);
  }, [source, asPlainText, imageBase]);

  // 2) Sanitize final HTML before any injection
  const sanitizedHtml = useMemo(() => {
    if (asPlainText) return rawHtml;
    if (!CAN_USE_DOM) {
      // SSR: safest is to return plain text rather than unsanitized HTML
      return rawHtml.replace(/<[^>]+>/g, "");
    }
    const withImages = imageBase !== undefined;
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: withImages
        ? [...ALLOWED_TAGS, ...IMAGE_TAGS]
        : ALLOWED_TAGS,
      ALLOWED_ATTR: withImages
        ? [...ALLOWED_ATTR, ...IMAGE_ATTR]
        : ALLOWED_ATTR,
    });
  }, [rawHtml, asPlainText, imageBase]);

  // An image that will not load is swapped for its alt text in a plain
  // box. A guide's screenshots are retaken and uploaded apart from the
  // app, so for a while after a new guide ships its pictures may not be
  // there yet, and a row of broken images says less than the words do.
  //
  // The markup is injected, so React cannot put a handler on each image.
  // `error` does not bubble, which is why this listens in the capture
  // phase, on the element that holds them all.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || imageBase === undefined) return undefined;

    const showAltInstead = (image: HTMLImageElement) => {
      const box = document.createElement("span");
      box.className = classes.missingImage;
      box.textContent = image.alt;
      image.replaceWith(box);
    };
    const onError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) {
        showAltInstead(event.target);
      }
    };

    root.addEventListener("error", onError, true);
    // One that failed before this ran: it will not say so again.
    root.querySelectorAll("img").forEach((image) => {
      if (image.complete && image.naturalWidth === 0 && image.currentSrc) {
        showAltInstead(image);
      }
    });
    return () => root.removeEventListener("error", onError, true);
  }, [sanitizedHtml, imageBase]);

  // Show loading skeleton (after hooks to follow rules of hooks)
  if (isLoading) {
    return (
      <div className={className}>
        <Stack gap="md">
          <Skeleton height={40} width="60%" radius="md" />
          <Skeleton height={100} radius="md" />
          <Skeleton height={30} width="80%" radius="md" />
          <Skeleton height={80} radius="md" />
          <Skeleton height={30} width="70%" radius="md" />
        </Stack>
      </div>
    );
  }

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

  const combinedClassName = [classes.markdown, className]
    .filter(Boolean)
    .join(" ");

  if (asPlainText) {
    return (
      <div className={combinedClassName}>
        <pre style={{ whiteSpace: "pre-wrap" }}>{rawHtml}</pre>
        {children}
      </div>
    );
  }

  return (
    // Delegated handler for the links inside the rendered markdown. The
    // links are real anchors, so Enter on one fires this click too; the
    // div itself is not interactive.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={rootRef}
      className={combinedClassName}
      onClick={handleClick}
      // eslint-disable-next-line react/no-danger -- Sanitised via DOMPurify with strict ALLOWED_TAGS/ATTR above.
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
