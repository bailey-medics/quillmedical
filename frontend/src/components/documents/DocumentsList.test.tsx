import { renderWithMantine } from "@/test/test-utils";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import DocumentsList from "./DocumentsList";
import type { DocumentProps } from "./Document";

describe("DocumentsList", () => {
  const docs: DocumentProps[] = [
    {
      name: "Clinical letter",
      type: "pdf",
      url: "/mock-documents/1_external_clinical_letter.pdf",
      thumbnailUrl:
        "/mock-documents/thumbnails/1_external_clinical_letter.pdf.png",
    },
    {
      name: "Photo.jpg",
      type: "image",
      url: "/sample.jpg",
      thumbnailUrl: "/sample-thumb.jpg",
    },
    { name: "Letter.docx", type: "word", url: "/sample.docx" },
  ];

  it("renders all document names", () => {
    renderWithMantine(<DocumentsList documents={docs} />);
    docs.forEach((doc) => {
      expect(screen.getByText(doc.name)).toBeInTheDocument();
    });
  });

  it("renders filenames extracted from URL", () => {
    renderWithMantine(<DocumentsList documents={docs} />);
    expect(
      screen.getByText("1_external_clinical_letter.pdf"),
    ).toBeInTheDocument();
    expect(screen.getByText("sample.jpg")).toBeInTheDocument();
    expect(screen.getByText("sample.docx")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithMantine(<DocumentsList documents={docs} onSelect={onSelect} />);
    await user.click(screen.getByText("Clinical letter"));
    expect(onSelect).toHaveBeenCalledWith(docs[0]);
  });

  it("renders skeleton cards when loading", () => {
    const { container } = renderWithMantine(
      <DocumentsList documents={[]} loading />,
    );
    const skeletons = container.querySelectorAll(".mantine-Skeleton-root");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("does not render documents when loading", () => {
    renderWithMantine(<DocumentsList documents={docs} loading />);
    docs.forEach((doc) => {
      expect(screen.queryByText(doc.name)).not.toBeInTheDocument();
    });
  });

  it("renders empty state when no documents", () => {
    renderWithMantine(<DocumentsList documents={[]} />);
    expect(screen.getByText("No documents to show")).toBeInTheDocument();
  });
});
