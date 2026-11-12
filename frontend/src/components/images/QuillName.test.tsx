import { MantineThemeProvider } from "@mantine/core";
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderWithMantine, remToPx } from "@test/test-utils";
import { makeTheme } from "@/theme";
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
        expect.stringContaining("quill-name-white.png"),
      );
    });

    it("shows the dark name for colour dark", () => {
      const { container } = renderWithMantine(<QuillName colour="dark" />);
      const img = container.querySelector("img");
      expect(img).toHaveAttribute(
        "src",
        expect.stringMatching(/\/quill-name\.png$/),
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
      expect(img).toHaveStyle({ height: remToPx("48rem") });
    });

    it("accepts string height value", () => {
      const { container } = renderWithMantine(<QuillName height="32px" />);
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ height: "32px" });
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
        <QuillName style={{ marginLeft: "1rem" }} />,
      );
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ marginLeft: remToPx("1rem") });
    });
  });

  describe("Defaults", () => {
    it("uses default height of 2.1rem", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ height: remToPx("2.1rem") });
    });

    it("uses default marginRight of 0.5rem", () => {
      const { container } = renderWithMantine(<QuillName />);
      const img = container.querySelector("img");
      expect(img).toHaveStyle({ marginRight: remToPx("0.5rem") });
    });
  });
});

describe("QuillName under another brand", () => {
  const ldd = makeTheme("ldd").theme;

  function renderAsLdd(ui: ReactElement) {
    return renderWithMantine(
      <MantineThemeProvider theme={ldd}>{ui}</MantineThemeProvider>,
    );
  }

  it("shows the brand's wordmark image, not Quill's", () => {
    renderAsLdd(<QuillName />);

    expect(
      screen.getByRole("img", { name: "Let's Do Digital" }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("brands/ldd/wordmark-white.svg"),
    );
  });

  it("shows the brand's dark wordmark for colour dark", () => {
    renderAsLdd(<QuillName colour="dark" />);

    expect(
      screen.getByRole("img", { name: "Let's Do Digital" }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("brands/ldd/wordmark-dark.svg"),
    );
  });

  it("shows a brand's white wordmark for colour dark when it has no dark one", () => {
    const ldd = makeTheme("ldd").theme;
    const white = {
      src: ldd.other?.wordmark?.src ?? "",
      alt: ldd.other?.wordmark?.alt ?? "",
    };
    const noDark = { ...ldd, other: { ...ldd.other, wordmark: white } };

    renderWithMantine(
      <MantineThemeProvider theme={noDark}>
        <QuillName colour="dark" />
      </MantineThemeProvider>,
    );

    expect(
      screen.getByRole("img", { name: "Let's Do Digital" }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("brands/ldd/wordmark-white.svg"),
    );
  });

  it("takes the height Quill's would have", () => {
    renderAsLdd(<QuillName />);

    expect(screen.getByRole("img", { name: "Let's Do Digital" })).toHaveStyle({
      height: remToPx("2.1rem"),
    });
  });

  it("keeps alt text a caller passes", () => {
    renderAsLdd(<QuillName alt="Home" />);

    expect(screen.getByRole("img", { name: "Home" })).toBeInTheDocument();
  });

  it("keeps the caller's class and spacing", () => {
    renderAsLdd(<QuillName className="custom-class" />);
    const img = screen.getByRole("img", { name: "Let's Do Digital" });

    expect(img).toHaveClass("custom-class");
    expect(img).toHaveStyle({ marginRight: remToPx("0.5rem") });
  });
});
