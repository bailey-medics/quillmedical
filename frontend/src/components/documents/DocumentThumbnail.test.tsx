import { renderWithMantine } from "@/test/test-utils";
import { screen } from "@testing-library/react";
import { DocumentThumbnail } from "./DocumentThumbnail";

describe("DocumentThumbnail", () => {
  it("renders an image with the correct alt text", () => {
    renderWithMantine(
      <DocumentThumbnail src="/thumb.png" alt="Test document" />,
    );
    expect(screen.getByAltText("Test document")).toBeInTheDocument();
  });

  it("renders an image with the correct src", () => {
    renderWithMantine(
      <DocumentThumbnail src="/thumb.png" alt="Test document" />,
    );
    expect(screen.getByAltText("Test document")).toHaveAttribute(
      "src",
      "/thumb.png",
    );
  });

  it("renders a skeleton when loading", () => {
    const { container } = renderWithMantine(
      <DocumentThumbnail src="" alt="" loading />,
    );
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
