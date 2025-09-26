import type { ReactNode } from "react";
import { useMemo } from "react";

type Props = {
  source: string;
  asPlainText?: boolean; // if true, return plain text instead of HTML
  className?: string;
  onLinkClick?: (href: string) => void;
  children?: ReactNode;
};

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineFormat(raw: string) {
  // operate on escaped input
  let s = escapeHtml(raw);
  // links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    return `<a href="${url}">${text}</a>`;
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

    // headers
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineFormat(h[2])}</h${level}>`);
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
  // convert to HTML then strip tags; if DOM available, use it for better decoding
  const html = mdToHtml(src);
  if (typeof document !== "undefined") {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent || d.innerText || "";
  }
  // fallback: remove tags
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
}

export default function MarkdownView({
  source,
  asPlainText = false,
  className,
  onLinkClick,
  children,
}: Props) {
  const rendered = useMemo(() => {
    if (asPlainText) return toPlainText(source);
    return mdToHtml(source);
  }, [source, asPlainText]);

  function handleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
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
        <pre style={{ whiteSpace: "pre-wrap" }}>{rendered}</pre>
        {children}
      </div>
    );
  }

  return (
    <div
      className={className}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
