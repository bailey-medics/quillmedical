import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import QuillLogo from "./QuillLogo";

describe("QuillLogo Component", () => {
  describe("Image rendering", () => {
    it("renders logo image", () => {
      const { container } = renderWithMantine(<QuillLogo />);
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });

    it("uses correct src path", () => {
      const { container } = renderWithMantine(<QuillLogo />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute(
        "src",
        expect.stringContaining("quill-logo.png"),
      );
    });

    it("has correct default alt text", () => {
      const { container } = renderWithMantine(<QuillLogo />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "Quill");
    });
  });

  describe("Props customisation", () => {
    it("accepts custom alt text", () => {
      const { container } = renderWithMantine(<QuillLogo alt="Custom Logo" />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "Custom Logo");
    });

    it("applies custom height", () => {
      const { container } = renderWithMantine(<QuillLogo height={256} />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("height", "256");
    });

    it("accepts string height value", () => {
      const { container } = renderWithMantine(<QuillLogo height="200px" />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("height", "200px");
    });

    it("applies custom className", () => {
      const { container } = renderWithMantine(
        <QuillLogo className="custom-class" />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveClass("custom-class");
    });

    it("applies custom style", () => {
      const { container } = renderWithMantine(
        <QuillLogo style={{ opacity: 0.5 }} />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ opacity: "0.5" });
    });
  });

  describe("Defaults", () => {
    it("uses default height of 128", () => {
      const { container } = renderWithMantine(<QuillLogo />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("height", "128");
    });
  });
});
