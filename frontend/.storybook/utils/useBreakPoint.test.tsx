/* @vitest-environment jsdom */
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, Mock } from "vitest";

vi.mock("@mantine/core", () => ({
  useMantineTheme: vi.fn(),
}));
vi.mock("@mantine/hooks", () => ({
  useMediaQuery: vi.fn(),
}));

import { useBreakpoint } from "./useBreakPoint";
import { useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

function TestComponent() {
  const bp = useBreakpoint();
  return <div data-testid="bp">{bp}</div>;
}

afterEach(() => {
  vi.resetAllMocks();
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

  function setupMediaMocks(values: Record<string, boolean>) {
    (useMantineTheme as Mock).mockReturnValue(theme);
    (useMediaQuery as Mock).mockImplementation((q: string) => {
      return Boolean(values[q]);
    });
  }

  it("returns xl when xl media query matches", () => {
    const queries = {
      [`(min-width: ${theme.breakpoints.xl})`]: true,
      [`(min-width: ${theme.breakpoints.lg})`]: true,
      [`(min-width: ${theme.breakpoints.md})`]: true,
      [`(min-width: ${theme.breakpoints.sm})`]: true,
      [`(min-width: ${theme.breakpoints.xs})`]: true,
    };
    setupMediaMocks(queries);
    render(<TestComponent />);
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
    setupMediaMocks(queries);
    render(<TestComponent />);
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
    setupMediaMocks(queries);
    render(<TestComponent />);
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
    setupMediaMocks(queries);
    render(<TestComponent />);
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
    setupMediaMocks(queries1);
    render(<TestComponent />);
    expect(screen.getByTestId("bp").textContent).toBe("xs");

    vi.resetAllMocks();

    const queries2 = {
      [`(min-width: ${theme.breakpoints.xl})`]: false,
      [`(min-width: ${theme.breakpoints.lg})`]: false,
      [`(min-width: ${theme.breakpoints.md})`]: false,
      [`(min-width: ${theme.breakpoints.sm})`]: false,
      [`(min-width: ${theme.breakpoints.xs})`]: false,
    };
    setupMediaMocks(queries2);
    render(<TestComponent />);
    expect(screen.getAllByTestId("bp")[0].textContent).toBe("xs");
  });
});
