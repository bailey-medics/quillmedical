/* @vitest-environment jsdom */
import { render, screen, cleanup } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, it, expect, afterEach } from "vitest";

import { useBreakpoint } from "./useBreakPoint";

function TestComponent() {
  const bp = useBreakpoint();
  return <div data-testid="bp">{bp}</div>;
}

afterEach(() => {
  cleanup();
});

describe("useBreakpoint", () => {
  const theme = {
    breakpoints: {
      xs: "0px",
      sm: "600px",
      md: "900px",
      lg: "1200px",
      xl: "1536px",
    },
  };

  function setupMediaQuery(matches: Record<string, boolean>) {
    // Override matchMedia to return specific matches
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: matches[query] ?? false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  function renderWithProvider() {
    return render(
      <MantineProvider theme={theme}>
        <TestComponent />
      </MantineProvider>,
    );
  }

  it("returns xl when xl media query matches", () => {
    const queries = {
      [`(min-width: ${theme.breakpoints.xl})`]: true,
      [`(min-width: ${theme.breakpoints.lg})`]: true,
      [`(min-width: ${theme.breakpoints.md})`]: true,
      [`(min-width: ${theme.breakpoints.sm})`]: true,
      [`(min-width: ${theme.breakpoints.xs})`]: true,
    };
    setupMediaQuery(queries);
    renderWithProvider();
    expect(screen.getByTestId("bp").textContent).toBe("xl");
  });

  it("returns lg when lg matches but xl does not", () => {
    const queries = {
      [`(min-width: ${theme.breakpoints.xl})`]: false,
      [`(min-width: ${theme.breakpoints.lg})`]: true,
      [`(min-width: ${theme.breakpoints.md})`]: true,
      [`(min-width: ${theme.breakpoints.sm})`]: true,
      [`(min-width: ${theme.breakpoints.xs})`]: true,
    };
    setupMediaQuery(queries);
    renderWithProvider();
    expect(screen.getByTestId("bp").textContent).toBe("lg");
  });

  it("returns md when md matches and larger do not", () => {
    const queries = {
      [`(min-width: ${theme.breakpoints.xl})`]: false,
      [`(min-width: ${theme.breakpoints.lg})`]: false,
      [`(min-width: ${theme.breakpoints.md})`]: true,
      [`(min-width: ${theme.breakpoints.sm})`]: true,
      [`(min-width: ${theme.breakpoints.xs})`]: true,
    };
    setupMediaQuery(queries);
    renderWithProvider();
    expect(screen.getByTestId("bp").textContent).toBe("md");
  });

  it("returns sm when sm matches and larger do not", () => {
    const queries = {
      [`(min-width: ${theme.breakpoints.xl})`]: false,
      [`(min-width: ${theme.breakpoints.lg})`]: false,
      [`(min-width: ${theme.breakpoints.md})`]: false,
      [`(min-width: ${theme.breakpoints.sm})`]: true,
      [`(min-width: ${theme.breakpoints.xs})`]: true,
    };
    setupMediaQuery(queries);
    renderWithProvider();
    expect(screen.getByTestId("bp").textContent).toBe("sm");
  });

  it("returns xs when only xs matches or none match", () => {
    const queries1 = {
      [`(min-width: ${theme.breakpoints.xl})`]: false,
      [`(min-width: ${theme.breakpoints.lg})`]: false,
      [`(min-width: ${theme.breakpoints.md})`]: false,
      [`(min-width: ${theme.breakpoints.sm})`]: false,
      [`(min-width: ${theme.breakpoints.xs})`]: true,
    };
    setupMediaQuery(queries1);
    renderWithProvider();
    expect(screen.getByTestId("bp").textContent).toBe("xs");

    cleanup();

    const queries2 = {
      [`(min-width: ${theme.breakpoints.xl})`]: false,
      [`(min-width: ${theme.breakpoints.lg})`]: false,
      [`(min-width: ${theme.breakpoints.md})`]: false,
      [`(min-width: ${theme.breakpoints.sm})`]: false,
      [`(min-width: ${theme.breakpoints.xs})`]: false,
    };
    setupMediaQuery(queries2);
    renderWithProvider();
    expect(screen.getAllByTestId("bp")[0].textContent).toBe("xs");
  });
});
