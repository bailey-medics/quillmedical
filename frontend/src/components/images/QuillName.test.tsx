import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import QuillName from "./QuillName";

describe("QuillName Component", () => {
  describe("Image rendering", () => {
    it("renders name image", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });

    it("uses correct src path", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute(
        "src",
        expect.stringContaining("quill-name.png"),
      );
    });

    it("has correct default alt text", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "Quill Medical");
    });
  });

  describe("Props customisation", () => {
    it("accepts custom alt text", () => {
      const { container } = renderWithMantine(<QuillName alt="Custom Name" />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "Custom Name");
    });

    it("applies custom height", () => {
      const { container } = renderWithMantine(<QuillName height={48} />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("height", "48");
    });

    it("accepts string height value", () => {
      const { container } = renderWithMantine(<QuillName height="32px" />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("height", "32px");
    });

    it("applies custom className", () => {
      const { container } = renderWithMantine(
        <QuillName className="custom-class" />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveClass("custom-class");
    });

    it("applies custom style", () => {
      const { container } = renderWithMantine(
        <QuillName style={{ marginLeft: 16 }} />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ marginLeft: "16px" });
    });
  });

  describe("Defaults", () => {
    it("uses default height of 24", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("height", "24");
    });

    it("uses default marginRight of 8px", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ marginRight: "8px" });
    });
  });
});
