import { describe, expect, it } from "vitest";
import { renderWithMantine, remToPx } from "@test/test-utils";
import EoeetaLogo from "./EoeetaLogo";

describe("EoeetaLogo Component", () => {
  describe("Image rendering", () => {
    it("renders the logo image", () => {
      const { container } = renderWithMantine(<EoeetaLogo />);
      expect(container.querySelector("img")).toBeInTheDocument();
    });

    it("uses the shared partner logo file", () => {
      const { container } = renderWithMantine(<EoeetaLogo />);
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        expect.stringContaining("email/partners/eoeeta.png"),
      );
    });

    it("names the academy in full for a screen reader", () => {
      const { getByAltText } = renderWithMantine(<EoeetaLogo />);
      expect(
        getByAltText("East of England Endoscopy Training Academy"),
      ).toBeInTheDocument();
    });
  });

  describe("Props customisation", () => {
    it("accepts custom alt text", () => {
      const { getByAltText } = renderWithMantine(<EoeetaLogo alt="EoEETA" />);
      expect(getByAltText("EoEETA")).toBeInTheDocument();
    });

    it("applies a numeric height in rem", () => {
      const { container } = renderWithMantine(<EoeetaLogo height={10} />);
      expect(container.querySelector("img")).toHaveStyle({
        height: remToPx("10rem"),
      });
    });

    it("accepts a string height value", () => {
      const { container } = renderWithMantine(<EoeetaLogo height="120px" />);
      expect(container.querySelector("img")).toHaveStyle({ height: "120px" });
    });
  });

  describe("Defaults", () => {
    it("uses a default height of 6rem", () => {
      const { container } = renderWithMantine(<EoeetaLogo />);
      expect(container.querySelector("img")).toHaveStyle({
        height: remToPx("6rem"),
      });
    });
  });
});
