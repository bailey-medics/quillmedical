/**
 * What the old hand-written parser got wrong, and what Quill's own rules
 * still require now that Marked does the parsing.
 */

import { describe, it, expect } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import { IconUserPlus } from "@tabler/icons-react";
import MarkdownView from "./MarkdownView";
import { renderMarkdown } from "./markdownRenderer";

function render(
  source: string,
  props: Partial<Parameters<typeof MarkdownView>[0]> = {},
) {
  return renderWithMantine(<MarkdownView source={source} {...props} />)
    .container;
}

describe("The four parser bugs", () => {
  it("keeps underscores in a link address as they are", () => {
    const container = render("[Report](https://x.org/safety_case_report)");
    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://x.org/safety_case_report");
    expect(container.querySelector("em")).toBeNull();
  });

  it("keeps a bracket inside a link address", () => {
    const container = render("[Evidence](https://x.org/evidence_(approved))");

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://x.org/evidence_(approved)",
    );
  });

  it("keeps inline code literal", () => {
    const container = render("Set `severity_score_current` and `**x**`.");
    const codes = [...container.querySelectorAll("code")].map(
      (code) => code.textContent,
    );

    expect(codes).toEqual(["severity_score_current", "**x**"]);
    expect(container.querySelector("code em, code strong")).toBeNull();
  });

  it("keeps a numbered list together around a nested bullet list", () => {
    const container = render(
      ["1. First", "2. Second", "   - detail", "3. Third"].join("\n"),
    );

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
    expect(container.querySelector("ol > li ul > li")?.textContent).toBe(
      "detail",
    );
  });

  it("keeps a list's starting number", () => {
    const container = render(["3. Third", "4. Fourth"].join("\n"));

    expect(container.querySelector("ol")?.getAttribute("start")).toBe("3");
  });

  it("keeps a second paragraph inside its step, numbering unbroken", () => {
    const container = render(
      ["1. One", "2. Two", "", "   More about two.", "", "3. Three"].join("\n"),
    );

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
  });
});

describe("Quill's own rules", () => {
  it("shows raw HTML as text", () => {
    const container = render("<b>bold</b> and <script>alert(1)</script>");

    expect(container.querySelector("b, script")).toBeNull();
    expect(container.textContent).toContain("<b>bold</b>");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "vbscript:alert(1)",
    "file:///etc/passwd",
  ])("sends a link to %s nowhere", (href) => {
    const container = render(`[Click](${href})`);

    expect(container.querySelector("a")?.getAttribute("href")).toBe("#");
  });

  it("marks every link noopener", () => {
    const container = render("[Site](https://example.com)");

    expect(container.querySelector("a")?.getAttribute("rel")).toBe(
      "noopener noreferrer nofollow",
    );
  });

  it.each([
    "../escape.png",
    "//elsewhere.com/x.png",
    "a%2F..%2Fb.png",
    "x.gif",
  ])("leaves out an image at %s", (path) => {
    const container = render(`![A picture](${path})`, { imageBase: "/g" });

    expect(container.querySelector("img")).toBeNull();
  });

  it("leaves out an image with no alt text", () => {
    const container = render("![](guide/form.png)", { imageBase: "/g" });

    expect(container.querySelector("img")).toBeNull();
  });

  it("leaves out every image without a base", () => {
    const container = render("![A picture](guide/form.png)");

    expect(container.querySelector("img")).toBeNull();
  });

  it("joins a wrapped paragraph's lines with spaces", () => {
    const container = render("One line\nwrapped onto two.");

    expect(container.querySelector("p")?.textContent).toBe(
      "One line wrapped onto two.",
    );
  });

  it("leaves icon notation alone inside code and a link address", () => {
    const html = renderMarkdown(
      "`:icon-user-plus:` and [go](/x/:icon-user-plus:)",
      { iconNames: new Set(["user-plus"]) },
    );

    expect(html).not.toContain("data-icon");
  });

  it("draws an icon only in prose", () => {
    const container = render("Press :icon-user-plus: now.", {
      icons: { "user-plus": <IconUserPlus /> },
    });

    expect(
      container.querySelector("span[data-icon='user-plus']"),
    ).not.toBeNull();
  });

  it("does not let one view's icons reach another", () => {
    renderMarkdown("x", { iconNames: new Set(["user-plus"]) });
    const html = renderMarkdown("Press :icon-user-plus: now.");

    expect(html).not.toContain("data-icon");
    expect(html).toContain(":icon-user-plus:");
  });
});
