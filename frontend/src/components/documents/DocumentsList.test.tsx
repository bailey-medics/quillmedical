import { renderWithMantine } from "@/test/test-utils";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import DocumentsList from "./DocumentsList";
import { DocumentProps } from "./Document";

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
});
