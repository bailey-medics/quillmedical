/**
 * Markdown View Component Module
 *
 * Safe markdown-to-HTML renderer with XSS protection using DOMPurify.
 * Supports rich text formatting (bold, italic, lists, links, code blocks)
 * with strict allowlist of HTML tags. Styled to match the app typography
 * system via CSS module. Used for clinical letters and messages.
 */

import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { ActionIcon, Skeleton, Stack } from "@mantine/core";
import Icon from "@/components/icons/Icon";
import classes from "./MarkdownView.module.css";
import { renderMarkdown } from "./markdownRenderer";

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
  /**
   * Icons the source may show in its text, by name. Off unless given, as
   * images are.
   *
   * With `{ "user-plus": <IconUserPlus /> }`, `:icon-user-plus:` shows
   * that icon in the line, at the size of the text around it, so a step
   * can show the button it means. `:button-user-plus:` shows it inside
   * a filled square, as the app draws an icon-only button, for a button
   * that looks like that on the page. A name not given here is left out.
   */
  icons?: Readonly<Record<string, ReactElement>>;
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
// `start` keeps a numbered list's first number, such as a list that resumes at 3.
const ALLOWED_ATTR = ["href", "rel", "target", "start"];
// Added to the lists above only when the caller gives an `imageBase`.
const IMAGE_TAGS = ["img"];
const IMAGE_ATTR = ["src", "alt", "loading"];
// Added only when the caller gives `icons`. The span is an empty slot the
// icon is drawn into once the markup is on the page.
const ICON_TAGS = ["span"];
const ICON_ATTR = ["data-icon", "data-button", "aria-hidden"];

// SSR/Node safety checks
const CAN_USE_DOM =
  typeof window !== "undefined" && typeof document !== "undefined";

function mdToHtml(
  src: string,
  imageBase?: string,
  icons?: Readonly<Record<string, ReactElement>>,
) {
  return renderMarkdown(src, {
    imageBase,
    iconNames: icons ? new Set(Object.keys(icons)) : undefined,
  });
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
    return (doc.body.textContent || "").trim();
  }
  // fallback: very simple tag strip + minimal entity decode
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .trim();
}

export default function MarkdownView({
  source,
  asPlainText = false,
  className,
  onLinkClick,
  children,
  isLoading = false,
  imageBase,
  icons,
}: Props) {
  // 1) Render markdown to HTML
  const rawHtml = useMemo(() => {
    if (asPlainText) return toPlainText(source);
    return mdToHtml(source, imageBase, icons);
  }, [source, asPlainText, imageBase, icons]);

  // 2) Sanitize final HTML before any injection
  const sanitizedHtml = useMemo(() => {
    if (asPlainText) return rawHtml;
    if (!CAN_USE_DOM) {
      // SSR: safest is to return plain text rather than unsanitized HTML
      return rawHtml.replace(/<[^>]+>/g, "");
    }
    const withImages = imageBase !== undefined;
    const withIcons = icons !== undefined;
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        ...ALLOWED_TAGS,
        ...(withImages ? IMAGE_TAGS : []),
        ...(withIcons ? ICON_TAGS : []),
      ],
      ALLOWED_ATTR: [
        ...ALLOWED_ATTR,
        ...(withImages ? IMAGE_ATTR : []),
        ...(withIcons ? ICON_ATTR : []),
      ],
    });
  }, [rawHtml, asPlainText, imageBase, icons]);

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
    // `isLoading` and `asPlainText` swap the root out, so a change to
    // either must look at the new one.
  }, [sanitizedHtml, imageBase, isLoading, asPlainText]);

  // The slots an icon is drawn into. The markup is injected, so React
  // only learns of them once it is on the page, and draws each icon into
  // its slot through a portal, with the app's own Icon component.
  const [iconSlots, setIconSlots] = useState<HTMLElement[]>([]);
  useEffect(() => {
    const root = rootRef.current;
    const slots =
      root && icons
        ? [...root.querySelectorAll<HTMLElement>("span[data-icon]")]
        : [];

    setIconSlots(slots);
  }, [sanitizedHtml, icons, isLoading, asPlainText]);

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
    // The click lands on whatever is innermost, which for a link written
    // `[**Users**](/admin/users)` is the bold text and not the link.
    const link = e.target instanceof Element ? e.target.closest("a") : null;
    if (link) {
      const href = link.getAttribute("href") || "";
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
    <>
      {/* Delegated handler for the links inside the rendered markdown. The
          links are real anchors, so Enter on one fires this click too; the
          div itself is not interactive. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={rootRef}
        className={combinedClassName}
        onClick={handleClick}
        // eslint-disable-next-line react/no-danger -- Sanitised via DOMPurify with strict ALLOWED_TAGS/ATTR above.
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
      {iconSlots.map((slot, index) => {
        const icon = icons?.[slot.dataset.icon ?? ""];

        if (!icon) return null;

        // A picture of the button, not a button: a span, so it cannot be
        // clicked or reached with Tab, and hidden from screen readers
        // with its slot.
        const drawn =
          slot.dataset.button === "true" ? (
            <ActionIcon component="span" size="md" className={classes.button}>
              <Icon icon={icon} size="sm" />
            </ActionIcon>
          ) : (
            <Icon icon={icon} size="sm" />
          );

        return createPortal(drawn, slot, String(index));
      })}
      {children}
    </>
  );
}
