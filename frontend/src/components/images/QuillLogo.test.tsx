import { MantineThemeProvider } from "@mantine/core";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderWithMantine, remToPx } from "@test/test-utils";
import { makeTheme } from "@/theme";
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

    it("uses light-grey src when colour is light-grey", () => {
      const { container } = renderWithMantine(
        <QuillLogo colour="light-grey" />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveAttribute(
        "src",
        expect.stringContaining("quill-logo-light-grey.png"),
      );
    });

    it("uses white src when colour is white", () => {
      const { container } = renderWithMantine(<QuillLogo colour="white" />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute(
        "src",
        expect.stringContaining("quill-logo-white.png"),
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
      expect(img).toHaveStyle({ height: remToPx("256rem") });
    });

    it("accepts string height value", () => {
      const { container } = renderWithMantine(<QuillLogo height="200px" />);
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ height: "200px" });
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
    it("uses default height of 8rem", () => {
      const { container } = renderWithMantine(<QuillLogo />);
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ height: remToPx("8rem") });
    });
  });
});

describe("QuillLogo under another brand", () => {
  const ldd = makeTheme("ldd").theme;

  function renderAsLdd(ui: ReactElement) {
    return renderWithMantine(
      <MantineThemeProvider theme={ldd}>{ui}</MantineThemeProvider>,
    );
  }

  it("shows the brand's logo", () => {
    const { container } = renderAsLdd(<QuillLogo />);
    const img = container.querySelector("img");

    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("brands/ldd/logo.png"),
    );
  });

  it.each(["default", "light-grey", "white"] as const)(
    "shows the brand's one logo whatever the colour: %s",
    (colour) => {
      const { container } = renderAsLdd(<QuillLogo colour={colour} />);
      const img = container.querySelector("img");

      expect(img).toHaveAttribute(
        "src",
        expect.stringContaining("brands/ldd/logo.png"),
      );
    },
  );

  it("names the brand in the alt text", () => {
    const { container } = renderAsLdd(<QuillLogo />);

    expect(container.querySelector("img")).toHaveAttribute(
      "alt",
      "Let's Do Digital",
    );
  });

  it("keeps alt text a caller passes", () => {
    const { container } = renderAsLdd(<QuillLogo alt="Home" />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "Home");
  });

  it("keeps the height", () => {
    const { container } = renderAsLdd(<QuillLogo height={4} />);

    expect(container.querySelector("img")).toHaveStyle({
      height: remToPx("4rem"),
    });
  });

  it("draws the logo on the brand's white tile", () => {
    const { container } = renderAsLdd(<QuillLogo />);

    expect(container.querySelector("img")).toHaveStyle({
      backgroundColor: "#ffffff",
    });
  });

  it("keeps a caller's style alongside the tile", () => {
    const { container } = renderAsLdd(
      <QuillLogo style={{ marginTop: "1rem" }} />,
    );
    const img = container.querySelector("img");

    expect(img).toHaveStyle({ backgroundColor: "#ffffff" });
    expect(img).toHaveStyle({ marginTop: remToPx("1rem") });
  });

  it("draws Quill's logo with no tile", () => {
    const { container } = renderWithMantine(<QuillLogo />);

    expect(container.querySelector("img")?.style.backgroundColor).toBe("");
  });
});
