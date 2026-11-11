import { createTheme, MantineThemeProvider } from "@mantine/core";
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import { makeTheme } from "@/theme";
import {
  BrandColourSwatches,
  BrandLogos,
  BrandScales,
} from "./BrandFoundations";

function renderAs(brand: string, ui: ReactElement) {
  return renderWithMantine(
    <MantineThemeProvider theme={makeTheme(brand).theme}>
      {ui}
    </MantineThemeProvider>,
  );
}

describe("BrandFoundations under Quill", () => {
  it("names Quill's colours in Quill's words", () => {
    renderAs("quill", <BrandColourSwatches />);

    expect(
      screen.getByText(/^#001a36 - navigation, primary actions/),
    ).toBeInTheDocument();
    expect(screen.getByText(/the quill on a navy tile/)).toBeInTheDocument();
  });

  it("calls the scales navy and amber, with shade 8 the default", () => {
    renderAs("quill", <BrandScales />);

    expect(screen.getByText("PRIMARY (NAVY)")).toBeInTheDocument();
    expect(screen.getByText("SECONDARY (AMBER)")).toBeInTheDocument();
    expect(screen.getByText("#001a36")).toBeInTheDocument();
  });

  it("lists the Quill logo files", () => {
    renderAs("quill", <BrandLogos />);

    expect(screen.getByText("Quill logo")).toBeInTheDocument();
    expect(screen.getByAltText("Navy quill mark")).toHaveAttribute(
      "src",
      expect.stringContaining("quill-logo.png"),
    );
  });
});

describe("BrandFoundations under Let's Do Digital", () => {
  it("names Let's Do Digital's colours in its own words", () => {
    renderAs("ldd", <BrandColourSwatches />);

    expect(
      screen.getByText(/^#0848a9 - the logo's blue back head/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^#707070 - a mid-dark grey from the logo's front head/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^#ffffff - the white tile the logo is drawn on/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/navy/)).not.toBeInTheDocument();
  });

  it("calls the scales blue and grey, with shade 5 the default", () => {
    renderAs("ldd", <BrandScales />);

    expect(screen.getByText("PRIMARY (BLUE)")).toBeInTheDocument();
    expect(screen.getByText("SECONDARY (GREY)")).toBeInTheDocument();
    expect(screen.getAllByText("#0848a9")).toHaveLength(1);
    expect(screen.getAllByText("DEFAULT")).toHaveLength(2);
  });

  it("shows the Let's Do Digital logo and wordmark, and no Quill file", () => {
    const { container } = renderAs("ldd", <BrandLogos />);

    expect(screen.getByText("Let's Do Digital logo")).toBeInTheDocument();
    expect(
      screen.getByAltText(
        "Let's Do Digital logo, a grey head in front of a blue one",
      ),
    ).toHaveAttribute("src", expect.stringContaining("brands/ldd/logo.png"));
    expect(
      screen.getByAltText("White Let's Do Digital wordmark"),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("brands/ldd/wordmark-white.svg"),
    );
    expect(
      screen.getByAltText("Blue Let's Do Digital wordmark"),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("brands/ldd/wordmark-dark.svg"),
    );

    const sources = [...container.querySelectorAll("img")].map((img) =>
      img.getAttribute("src"),
    );

    expect(sources.some((src) => src?.includes("quill"))).toBe(false);
  });
});

describe("a brand with no words", () => {
  it("throws, naming the brand, rather than showing Quill's", () => {
    // React logs the error a render throws; it is the expected outcome
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const unknown = createTheme({
      other: { brand: "purple", colours: makeColours() },
    });

    expect(() =>
      renderWithMantine(
        <MantineThemeProvider theme={unknown}>
          <BrandColourSwatches />
        </MantineThemeProvider>,
      ),
    ).toThrow(/no words for the brand "purple"/);

    quiet.mockRestore();
  });
});

/** Any four colours: the words are what is missing, not the colours. */
function makeColours() {
  return {
    primary: "#000000",
    secondary: "#111111",
    background: "#ffffff",
    mark: "#222222",
  };
}
