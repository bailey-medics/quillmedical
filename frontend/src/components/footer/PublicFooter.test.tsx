import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import PublicFooter from "./PublicFooter";

describe("PublicFooter", () => {
  it("renders as a footer element", () => {
    const { container } = renderWithMantine(<PublicFooter />);
    expect(container.querySelector("footer")).toBeInTheDocument();
  });

  it("renders the Quill Medical logo", () => {
    const { container } = renderWithMantine(<PublicFooter />);
    const logo = container.querySelector('img[alt="Quill Medical"]');
    expect(logo).toBeInTheDocument();
  });

  it("renders the description text", () => {
    renderWithMantine(<PublicFooter />);
    expect(screen.getByText(/modern, secure platform/)).toBeInTheDocument();
  });

  it("renders link group titles", () => {
    renderWithMantine(<PublicFooter />);
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Legal")).toBeInTheDocument();
  });

  it("renders links within groups", () => {
    renderWithMantine(<PublicFooter />);
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Privacy policy")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
  });

  it("renders copyright text with current year", () => {
    renderWithMantine(<PublicFooter />);
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} Quill Medical. All rights reserved.`),
    ).toBeInTheDocument();
  });

  it("renders the email contact link", () => {
    renderWithMantine(<PublicFooter />);
    const emailLink = screen.getByText("Email address coming soon");
    expect(emailLink).toBeInTheDocument();
    expect(emailLink.closest("a")).toHaveAttribute(
      "href",
      "mailto:Email address coming soon",
    );
  });
});
