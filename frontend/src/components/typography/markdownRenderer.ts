/**
 * Turns Markdown into HTML for `MarkdownView`, through Marked.
 *
 * Quill used to parse Markdown with its own regular expressions, one pass
 * for each mark. Each pass ran over what the passes before it had made,
 * so an underscore in a link address became italics, a `)` ended a link
 * early, inline code picked up bold and italics, and a numbered list with
 * a bullet nested in it restarted at 1. A real parser reads the text once
 * and knows which part is code, which is an address and which is prose.
 *
 * What Quill decided stays here, in Marked's own hooks:
 *
 * - **Raw HTML is shown as text**, never passed through.
 * - **A link goes only where `isSafeUrl` allows**, and anywhere else
 *   becomes `#`.
 * - **An image needs a base, alt text and an address beneath the base**,
 *   or it is left out.
 * - **`:icon-name:` and `:button-name:` become icon slots** only when the
 *   caller gives that icon, and never inside code or an address, because
 *   Marked has already set those apart.
 *
 * GitHub's extras, such as tables and bare web addresses becoming links,
 * are off, as they always were. The HTML this returns is still passed
 * through DOMPurify before it reaches the page.
 *
 * A new Marked is made for each call rather than set up once with
 * `marked.use`, which changes Marked for every caller: one view's icons
 * or image base must never reach another.
 */

import { Marked, type Token, type Tokens } from "marked";

/** An image address a guide may use: beneath the base, and nowhere else. */
const IMAGE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(png|jpe?g|webp)$/;

/** `:icon-user-plus:` or `:button-user-plus:` at the start of the text. */
const ICON_AT_START = /^:(icon|button)-([a-z0-9]+(?:-[a-z0-9]+)*):/;

/** Where an icon might begin, so Marked knows where to look. */
const ICON_START = /:(icon|button)-[a-z0-9]/;

export interface RenderOptions {
  /** Where images live; without it, every image is left out */
  imageBase?: string;
  /** The names of the icons the caller can draw; others are left out */
  iconNames?: ReadonlySet<string>;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Whether a link may go there: the web, email, a phone, or this site. */
export function isSafeUrl(raw: string): boolean {
  if (
    raw.startsWith("#") ||
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../")
  ) {
    return true;
  }

  try {
    const url = new URL(raw);

    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    // Not absolute, so relative: it can only point within this site.
  }

  try {
    new URL(raw, "https://example.com/");

    return true;
  } catch {
    return false;
  }
}

interface IconToken extends Tokens.Generic {
  type: "quillIcon";
  look: "icon" | "button";
  name: string;
}

function isIconToken(token: Tokens.Generic): token is IconToken {
  return token.type === "quillIcon";
}

/** Marked's token union includes a generic shape, so "text" needs a guard. */
function isText(token: Token): token is Tokens.Text {
  return token.type === "text";
}

/** A Marked set up with Quill's rules, for one call. */
function quillMarked({ imageBase, iconNames }: RenderOptions): Marked {
  const marked = new Marked({ gfm: false, breaks: false, async: false });

  // A line break inside a paragraph is only where the source was wrapped,
  // as guides wrap their lines. The view keeps white space as written, so
  // the break is made a space here, as the old parser joined lines.
  marked.use({
    walkTokens(token: Token): void {
      if (isText(token) && !token.tokens?.length) {
        token.text = token.text.replace(/\n/g, " ");
      }
    },
  });

  marked.use({
    renderer: {
      // Raw HTML is shown as the text it is.
      html({ text, block }: Tokens.HTML | Tokens.Tag): string {
        const escaped = escapeHtml(text.trim());

        return block ? `<p>${escaped}</p>\n` : escapeHtml(text);
      },

      link({ href, tokens }: Tokens.Link): string {
        const safe = isSafeUrl(href.trim()) ? href.trim() : "#";
        const text = this.parser.parseInline(tokens);

        return `<a href="${escapeHtml(safe)}" rel="noopener noreferrer nofollow">${text}</a>`;
      },

      image({ href, text }: Tokens.Image): string {
        const path = href.trim();
        const alt = text.trim();
        if (imageBase === undefined || alt === "" || !IMAGE_PATH.test(path)) {
          return "";
        }

        const src = `${imageBase.replace(/\/+$/, "")}/${path}`;

        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
      },
    },
  });

  if (iconNames !== undefined) {
    marked.use({
      extensions: [
        {
          name: "quillIcon",
          level: "inline",
          start(src: string): number | undefined {
            return ICON_START.exec(src)?.index;
          },
          tokenizer(src: string): IconToken | undefined {
            const match = ICON_AT_START.exec(src);
            if (!match) return undefined;

            return {
              type: "quillIcon",
              raw: match[0],
              look: match[1] === "button" ? "button" : "icon",
              name: match[2],
            };
          },
          renderer(token: Tokens.Generic): string {
            if (!isIconToken(token) || !iconNames.has(token.name)) return "";

            const button = token.look === "button" ? ' data-button="true"' : "";

            return `<span data-icon="${token.name}"${button} aria-hidden="true"></span>`;
          },
        },
      ],
    });
  }

  return marked;
}

/** Markdown to HTML, before sanitising. */
export function renderMarkdown(
  source: string,
  options: RenderOptions = {},
): string {
  const html = quillMarked(options).parse(source.replace(/\r\n/g, "\n"));

  return typeof html === "string" ? html : "";
}
