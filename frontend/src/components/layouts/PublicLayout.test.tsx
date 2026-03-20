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

  it("renders the PublicTopRibbon in the header", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
  });

  it("renders the Quill Medical logo in the ribbon", () => {
    const { container } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const logo = container.querySelector('img[alt="Quill Medical"]');
    expect(logo).toBeInTheDocument();
  });

  it("renders the PublicFooter with copyright text", () => {
    const { getByText } = renderWithMantine(
      <PublicLayout>
        <p>Content</p>
      </PublicLayout>,
    );
    const year = new Date().getFullYear();
    expect(
      getByText(`© ${year} Quill Medical. All rights reserved.`),
    ).toBeInTheDocument();
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
