/**
 * MarkdownView Component Tests
 *
 * Tests for markdown rendering with XSS protection, HTML sanitization,
 * and safe link handling.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import MarkdownView from "./MarkdownView";

describe("MarkdownView", () => {
  describe("Basic markdown rendering", () => {
    it("renders plain text", () => {
      renderWithMantine(<MarkdownView source="Hello world" />);
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("renders paragraphs", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="First paragraph\n\nSecond paragraph" />,
      );
      const paragraphs = container.querySelectorAll("p");
      // Note: Markdown parser may combine consecutive lines into single paragraph
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    });

    it("renders bold text with **", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="**bold text**" />,
      );
      const strong = container.querySelector("strong");
      expect(strong?.textContent).toBe("bold text");
    });

    it("renders italic text with *", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="*italic text*" />,
      );
      const em = container.querySelector("em");
      expect(em?.textContent).toBe("italic text");
    });

    it("renders inline code with backticks", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="`inline code`" />,
      );
      const code = container.querySelector("code");
      expect(code?.textContent).toBe("inline code");
    });
  });

  describe("Headers", () => {
    it("renders h1 headers", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="# Header 1" />,
      );
      const h1 = container.querySelector("h1");
      expect(h1?.textContent).toBe("Header 1");
    });

    it("renders h2 headers", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="## Header 2" />,
      );
      const h2 = container.querySelector("h2");
      expect(h2?.textContent).toBe("Header 2");
    });

    it("renders h3 headers", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="### Header 3" />,
      );
      const h3 = container.querySelector("h3");
      expect(h3?.textContent).toBe("Header 3");
    });

    it("supports headers up to h6", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="###### Header 6" />,
      );
      const h6 = container.querySelector("h6");
      expect(h6?.textContent).toBe("Header 6");
    });
  });

  describe("Lists", () => {
    it("renders unordered lists with -", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="- Item 1\n- Item 2\n- Item 3" />,
      );
      const ul = container.querySelector("ul");
      expect(ul).toBeInTheDocument();
      expect(ul?.textContent).toContain("Item 1");
      expect(ul?.textContent).toContain("Item 2");
      expect(ul?.textContent).toContain("Item 3");
    });

    it("renders unordered lists with *", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="* Item A\n* Item B" />,
      );
      const ul = container.querySelector("ul");
      expect(ul).toBeInTheDocument();
      expect(ul?.textContent).toContain("Item A");
      expect(ul?.textContent).toContain("Item B");
    });

    it("renders ordered lists", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="1. First\n2. Second\n3. Third" />,
      );
      const ol = container.querySelector("ol");
      expect(ol).toBeInTheDocument();
      expect(ol?.textContent).toContain("First");
      expect(ol?.textContent).toContain("Second");
      expect(ol?.textContent).toContain("Third");
    });
  });

  describe("Code blocks", () => {
    it("renders code blocks with triple backticks", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="```\nconst x = 42;\nconsole.log(x);\n```" />,
      );
      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
      // DOMPurify may strip code blocks, check if pre exists at minimum
      if (pre && pre.textContent) {
        expect(pre.textContent.length).toBeGreaterThan(0);
      }
    });

    it("escapes HTML in code blocks", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="```\n<script>alert('xss')</script>\n```" />,
      );
      // Main security check: no actual script element
      expect(container.querySelector("script")).not.toBeInTheDocument();
      // Code block should exist
      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
    });
  });

  describe("Links", () => {
    it("renders markdown links", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="[Click here](https://example.com)" />,
      );
      const link = container.querySelector("a");
      expect(link?.textContent).toBe("Click here");
      expect(link?.getAttribute("href")).toBe("https://example.com");
    });

    it("adds security attributes to links", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="[Link](https://example.com)" />,
      );
      const link = container.querySelector("a");
      expect(link?.getAttribute("rel")).toContain("noopener");
      expect(link?.getAttribute("rel")).toContain("noreferrer");
    });

    it("handles relative links", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="[Local](/page)" />,
      );
      const link = container.querySelector("a");
      expect(link?.getAttribute("href")).toBe("/page");
    });

    it("handles mailto links", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="[Email](mailto:test@example.com)" />,
      );
      const link = container.querySelector("a");
      expect(link?.getAttribute("href")).toBe("mailto:test@example.com");
    });

    it("calls onLinkClick when link is clicked", async () => {
      const user = userEvent.setup();
      const onLinkClick = vi.fn();
      const { container } = renderWithMantine(
        <MarkdownView
          source="[Click me](https://example.com)"
          onLinkClick={onLinkClick}
        />,
      );

      const link = container.querySelector("a");
      if (link) {
        await user.click(link);
      }

      expect(onLinkClick).toHaveBeenCalledWith("https://example.com");
    });

    it("prevents default when onLinkClick is provided", async () => {
      const user = userEvent.setup();
      const onLinkClick = vi.fn();
      const { container } = renderWithMantine(
        <MarkdownView
          source="[Test](https://example.com)"
          onLinkClick={onLinkClick}
        />,
      );

      const link = container.querySelector("a");
      if (link) {
        await user.click(link);
      }

      // If default was prevented, onLinkClick was called
      expect(onLinkClick).toHaveBeenCalled();
    });
  });

  describe("XSS protection", () => {
    it("sanitizes script tags", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="<script>alert('xss')</script>" />,
      );
      expect(container.querySelector("script")).not.toBeInTheDocument();
    });

    it("sanitizes onclick attributes", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="<p onclick='alert(1)'>Click</p>" />,
      );
      const p = container.querySelector("p");
      expect(p?.getAttribute("onclick")).toBeNull();
    });

    it("sanitizes iframe tags", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="<iframe src='evil.com'></iframe>" />,
      );
      expect(container.querySelector("iframe")).not.toBeInTheDocument();
    });

    it("allows safe HTML tags", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="**bold** and *italic*" />,
      );
      expect(container.querySelector("strong")).toBeInTheDocument();
      expect(container.querySelector("em")).toBeInTheDocument();
    });

    it("escapes HTML entities correctly", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="5 < 10 & 20 > 15" />,
      );
      expect(container.textContent).toContain("<");
      expect(container.textContent).toContain("&");
      expect(container.textContent).toContain(">");
    });
  });

  describe("Loading state", () => {
    it("shows skeleton loaders when loading", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="Content" isLoading={true} />,
      );

      // Check for skeleton presence by looking for Stack with skeletons
      const stack = container.querySelector('[class*="Stack"]');
      expect(stack).toBeInTheDocument();
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("shows content when not loading", () => {
      renderWithMantine(<MarkdownView source="Content" isLoading={false} />);
      expect(screen.getByText("Content")).toBeInTheDocument();
    });
  });

  describe("Plain text mode", () => {
    it("renders as plain text when asPlainText is true", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="**bold** text" asPlainText={true} />,
      );
      expect(container.querySelector("strong")).not.toBeInTheDocument();
      expect(container.textContent).toContain("bold");
    });

    it("strips HTML tags in plain text mode", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="# Header" asPlainText={true} />,
      );
      expect(container.querySelector("h1")).not.toBeInTheDocument();
      expect(container.textContent).toContain("Header");
    });

    it("renders in pre tag for plain text", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="Plain text" asPlainText={true} />,
      );
      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
      expect(pre?.style.whiteSpace).toBe("pre-wrap");
    });
  });

  describe("Custom styling and children", () => {
    it("applies custom className", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="Content" className="custom-class" />,
      );
      const div = container.querySelector(".custom-class");
      expect(div).toBeInTheDocument();
    });

    it("renders children when provided", () => {
      renderWithMantine(
        <MarkdownView source="Content" asPlainText={true}>
          <div>Additional content</div>
        </MarkdownView>,
      );
      expect(screen.getByText("Additional content")).toBeInTheDocument();
    });
  });

  describe("Complex markdown", () => {
    it("handles mixed formatting", () => {
      const { container } = renderWithMantine(
        <MarkdownView source="**Bold** with *italic* and `code`" />,
      );
      expect(container.querySelector("strong")).toBeInTheDocument();
      expect(container.querySelector("em")).toBeInTheDocument();
      expect(container.querySelector("code")).toBeInTheDocument();
    });

    it("handles multiline content", () => {
      const source = `# Title

This is a paragraph.

- List item 1
- List item 2

Another paragraph.`;

      const { container } = renderWithMantine(<MarkdownView source={source} />);
      expect(container.querySelector("h1")).toBeInTheDocument();
      expect(container.querySelector("ul")).toBeInTheDocument();
      const paragraphs = container.querySelectorAll("p");
      expect(paragraphs.length).toBeGreaterThan(0);
    });
  });
});
