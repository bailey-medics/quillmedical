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
    expect(
      screen.getByText(/online learning and assessment for clinicians/i),
    ).toBeInTheDocument();
  });

  it("renders link group titles", () => {
    renderWithMantine(<PublicFooter />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Legal")).toBeInTheDocument();
  });

  it.each([
    ["Learning", "/learning"],
    ["Assessments", "/assessments"],
    ["For educators", "/for-educators"],
    ["Accessibility", "/accessibility"],
    ["Security", "/security"],
    ["Clinical records", "/clinical-records"],
    ["About", "/about"],
    ["Pricing", "/pricing"],
    ["Accessibility statement", "/accessibility-statement"],
  ])("links %s to %s", (name, href) => {
    renderWithMantine(<PublicFooter />);
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("no longer links to the retired patient record pages", () => {
    renderWithMantine(<PublicFooter />);
    for (const retired of [
      "/clinical-messaging",
      "/structured-records",
      "/modular-deployment",
      "/competency-access",
      "/external-referrals",
      "/clinical-teaching",
    ]) {
      expect(
        screen
          .getAllByRole("link")
          .some((link) => link.getAttribute("href") === retired),
      ).toBe(false);
    }
  });

  it("renders links within other groups", () => {
    renderWithMantine(<PublicFooter />);
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
    const emailLink = screen.getByText("info@quill-medical.com");
    expect(emailLink).toBeInTheDocument();
    expect(emailLink.closest("a")).toHaveAttribute(
      "href",
      "mailto:info@quill-medical.com",
    );
  });
});
