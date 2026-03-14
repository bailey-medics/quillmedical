import { renderWithMantine } from "@/test/test-utils";
import { screen } from "@testing-library/react";
import { Document, DocumentProps } from "./Document";

describe("Document", () => {
  const base: DocumentProps = {
    name: "Test Doc",
    type: "pdf",
    url: "/test.pdf",
  };

  it("renders PDF with iframe", () => {
    renderWithMantine(<Document {...base} />);
    expect(screen.getByTitle("Test Doc")).toBeInTheDocument();
  });

  it("renders image with <img>", () => {
    renderWithMantine(<Document {...base} type="image" url="/test.jpg" />);
    expect(screen.getByAltText("Test Doc")).toBeInTheDocument();
  });

  it("renders word doc fallback", () => {
    renderWithMantine(<Document {...base} type="word" url="/test.docx" />);
    expect(
      screen.getByText(/Word document preview not available/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download/i })).toHaveAttribute(
      "href",
      "/test.docx",
    );
  });

  it("renders other fallback", () => {
    renderWithMantine(<Document {...base} type="other" url="/test.bin" />);
    expect(
      screen.getByText(/Document preview not available/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download/i })).toHaveAttribute(
      "href",
      "/test.bin",
    );
  });
});
