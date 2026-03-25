import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import PublicNotFound from "./PublicNotFound";

describe("PublicNotFound", () => {
  it("renders the 404 title", () => {
    const { getByText } = renderWithMantine(<PublicNotFound />);
    expect(getByText("404 — Page not found")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    const { getByText } = renderWithMantine(<PublicNotFound />);
    expect(
      getByText(/the page you requested does not exist/i),
    ).toBeInTheDocument();
  });

  it("renders a home button linking to / by default", () => {
    const { getByRole } = renderWithMantine(<PublicNotFound />);
    const link = getByRole("link", { name: /go to home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders a home button with custom href", () => {
    const { getByRole } = renderWithMantine(
      <PublicNotFound homeHref="/about" />,
    );
    const link = getByRole("link", { name: /go to home/i });
    expect(link).toHaveAttribute("href", "/about");
  });

  it("renders inside a dark background", () => {
    const { getByTestId } = renderWithMantine(<PublicNotFound />);
    expect(getByTestId("dark-background")).toBeInTheDocument();
  });
});
