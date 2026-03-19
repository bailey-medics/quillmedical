import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import PublicLayout from "./PublicLayout";

describe("PublicLayout", () => {
  it("renders children content", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout>
        <p>Page content</p>
      </PublicLayout>,
    );
    expect(getByText("Page content")).toBeInTheDocument();
  });

  it("renders the Quill Medical logo link", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const homeLink = container.querySelector('a[href="/"]');
    expect(homeLink).toBeInTheDocument();
  });

  it("renders sign in link with default URL", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const signIn = getByText("Sign in");
    expect(signIn).toBeInTheDocument();
    expect(signIn.closest("a")).toHaveAttribute("href", "/app/");
  });

  it("renders sign in link with custom URL", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout signInUrl="https://app.quill-medical.com/">
        <p>Content</p>
      </PublicLayout>,
    );
    const signIn = getByText("Sign in");
    expect(signIn.closest("a")).toHaveAttribute(
      "href",
      "https://app.quill-medical.com/",
    );
  });

  it("renders footer with copyright text", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const year = new Date().getFullYear();
    expect(getByText(`© ${year} Quill Medical`)).toBeInTheDocument();
  });

  it("renders custom footer text", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout footerText="Custom footer">
        <p>Content</p>
      </PublicLayout>,
    );
    expect(getByText("Custom footer")).toBeInTheDocument();
  });

  it("has header, main, and footer semantic elements", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    expect(container.querySelector("header")).toBeInTheDocument();
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(container.querySelector("footer")).toBeInTheDocument();
  });
});
