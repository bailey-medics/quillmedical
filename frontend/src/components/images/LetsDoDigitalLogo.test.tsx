import { describe, expect, it } from "vitest";
import { renderWithMantine, remToPx } from "@test/test-utils";
import LetsDoDigitalLogo from "./LetsDoDigitalLogo";

describe("LetsDoDigitalLogo Component", () => {
  describe("Image rendering", () => {
    it("renders the logo image", () => {
      const { container } = renderWithMantine(<LetsDoDigitalLogo />);
      expect(container.querySelector("img")).toBeInTheDocument();
    });

    it("uses the shared email logo file", () => {
      const { container } = renderWithMantine(<LetsDoDigitalLogo />);
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        expect.stringContaining("email/ldd-logo.png"),
      );
    });

    it("names the wordless mark for a screen reader", () => {
      const { getByAltText } = renderWithMantine(<LetsDoDigitalLogo />);
      expect(getByAltText("Let’s Do Digital")).toBeInTheDocument();
    });
  });

  describe("Sizing", () => {
    it("scales the mark up inside its box", () => {
      const { container } = renderWithMantine(<LetsDoDigitalLogo />);
      expect(container.querySelector("img")?.className).toMatch(/mark/);
    });
  });

  describe("Props customisation", () => {
    it("accepts custom alt text", () => {
      const { getByAltText } = renderWithMantine(
        <LetsDoDigitalLogo alt="LDD" />,
      );
      expect(getByAltText("LDD")).toBeInTheDocument();
    });

    it("applies a numeric height in rem", () => {
      const { container } = renderWithMantine(<LetsDoDigitalLogo height={8} />);
      expect(container.querySelector("img")).toHaveStyle({
        height: remToPx("8rem"),
      });
    });

    it("accepts a string height value", () => {
      const { container } = renderWithMantine(
        <LetsDoDigitalLogo height="120px" />,
      );
      expect(container.querySelector("img")).toHaveStyle({ height: "120px" });
    });
  });

  describe("Defaults", () => {
    it("uses a default height of 5rem", () => {
      const { container } = renderWithMantine(<LetsDoDigitalLogo />);
      expect(container.querySelector("img")).toHaveStyle({
        height: remToPx("5rem"),
      });
    });
  });
});
