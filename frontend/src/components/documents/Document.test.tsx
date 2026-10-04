import { renderWithMantine } from "@/test/test-utils";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Document } from "./Document";
import type { DocumentProps } from "./Document";

const { useNativePdfViewer } = vi.hoisted(() => ({
  useNativePdfViewer: vi.fn(),
}));

vi.mock("./useNativePdfViewer", () => ({ useNativePdfViewer }));

// PdfPages has its own tests. Here it only matters that it was chosen,
// and what it was given.
vi.mock("./PdfPages", () => ({
  default: ({ name, url }: { name: string; url: string }) => (
    <div data-testid="pdf-pages" data-name={name} data-url={url} />
  ),
}));

describe("Document", () => {
  const base: DocumentProps = {
    name: "Test Doc",
    type: "pdf",
    url: "/test.pdf",
  };

  beforeEach(() => {
    useNativePdfViewer.mockReturnValue(true);
  });

  it("frames a PDF where the browser's own viewer can show it", () => {
    renderWithMantine(<Document {...base} />);

    const frame = screen.getByTitle("Test Doc");
    expect(frame.tagName).toBe("IFRAME");
    expect(screen.queryByTestId("pdf-pages")).not.toBeInTheDocument();
  });

  it("gives the frame the file's own address, with nothing added", () => {
    renderWithMantine(<Document {...base} />);

    expect(screen.getByTitle("Test Doc")).toHaveAttribute("src", "/test.pdf");
  });

  it("draws the pages itself where the browser's viewer cannot", async () => {
    useNativePdfViewer.mockReturnValue(false);

    renderWithMantine(<Document {...base} />);

    const pages = await screen.findByTestId("pdf-pages");
    expect(pages).toHaveAttribute("data-name", "Test Doc");
    expect(pages).toHaveAttribute("data-url", "/test.pdf");
    expect(screen.queryByTitle("Test Doc")).not.toBeInTheDocument();
  });

  it("names the document above it", () => {
    renderWithMantine(<Document {...base} />);

    expect(
      screen.getByRole("heading", { name: "Test Doc" }),
    ).toBeInTheDocument();
  });

  it("renders image with <img>", () => {
    renderWithMantine(<Document {...base} type="image" url="/test.jpg" />);
    expect(screen.getByAltText("Test Doc")).toBeInTheDocument();
  });

  it("shows an image the same way whatever the browser's PDF viewer", () => {
    useNativePdfViewer.mockReturnValue(false);

    renderWithMantine(<Document {...base} type="image" url="/test.jpg" />);

    expect(screen.getByAltText("Test Doc")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-pages")).not.toBeInTheDocument();
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
