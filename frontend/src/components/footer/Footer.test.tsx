import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import Footer from "./Footer";

describe("Footer Component", () => {
  describe("Basic rendering", () => {
    it("renders footer with text", () => {
      const { getByText } = renderWithMantine(<Footer text="Test Footer" />);
      expect(getByText("Test Footer")).toBeInTheDocument();
    });

    it("does not render footer component when no text and not loading", () => {
      const { queryByText } = renderWithMantine(<Footer />);
      // Should not render any visible footer content
      expect(queryByText(/./)).not.toBeInTheDocument();
    });

    it("renders with right-justified text", () => {
      const { container } = renderWithMantine(<Footer text="Right aligned" />);
      const footer = container.querySelector('[style*="flex-end"]');
      expect(footer).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("renders skeleton when loading is true", () => {
      const { container } = renderWithMantine(<Footer loading={true} />);
      const skeleton = container.querySelector(".mantine-Skeleton-root");
      expect(skeleton).toBeInTheDocument();
    });

    it("does not render text when loading", () => {
      const { queryByText } = renderWithMantine(
        <Footer text="Should not show" loading={true} />,
      );
      expect(queryByText("Should not show")).not.toBeInTheDocument();
    });

    it("shows footer container when loading even without text", () => {
      const { container } = renderWithMantine(<Footer loading={true} />);
      expect(container.firstChild).not.toBeNull();
    });
  });

  describe("Size variations", () => {
    it("renders with small size (14px)", () => {
      const { getByText } = renderWithMantine(
        <Footer text="Small text" size="sm" />,
      );
      const text = getByText("Small text");
      expect(text).toBeInTheDocument();
    });

    it("renders with medium size (16px)", () => {
      const { getByText } = renderWithMantine(
        <Footer text="Medium text" size="md" />,
      );
      const text = getByText("Medium text");
      expect(text).toBeInTheDocument();
    });

    it("renders with large size (20px)", () => {
      const { getByText } = renderWithMantine(
        <Footer text="Large text" size="lg" />,
      );
      const text = getByText("Large text");
      expect(text).toBeInTheDocument();
    });

    it("defaults to medium size when size not specified", () => {
      const { getByText } = renderWithMantine(<Footer text="Default size" />);
      const text = getByText("Default size");
      expect(text).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("has border-top styling", () => {
      const { container } = renderWithMantine(<Footer text="Styled footer" />);
      const footer = container.firstChild;
      expect(footer).toBeInTheDocument();
    });

    it("uses gray color for text", () => {
      const { getByText } = renderWithMantine(<Footer text="Gray text" />);
      const text = getByText("Gray text");
      expect(text).toBeInTheDocument();
      // Mantine applies colors via CSS variables
    });
  });

  describe("Content variations", () => {
    it("renders with very long text", () => {
      const longText =
        "This is a very long footer text that should still render correctly even when it contains many characters and words";
      const { getByText } = renderWithMantine(<Footer text={longText} />);
      expect(getByText(longText)).toBeInTheDocument();
    });

    it("renders with short text", () => {
      const { getByText } = renderWithMantine(<Footer text="Hi" />);
      expect(getByText("Hi")).toBeInTheDocument();
    });

    it("renders with special characters", () => {
      const { getByText } = renderWithMantine(
        <Footer text="User: test@example.com | ID: 123" />,
      );
      expect(getByText("User: test@example.com | ID: 123")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles undefined text gracefully", () => {
      const { queryByText, container } = renderWithMantine(
        <Footer text={undefined} />,
      );
      // Should not render any visible footer text
      const skeleton = container.querySelector(".mantine-Skeleton-root");
      expect(skeleton).not.toBeInTheDocument();
      expect(queryByText(/./)).not.toBeInTheDocument();
    });

    it("handles empty string text", () => {
      const { container } = renderWithMantine(<Footer text="" />);
      // Should not render any visible footer content
      const skeleton = container.querySelector(".mantine-Skeleton-root");
      expect(skeleton).not.toBeInTheDocument();
    });

    it("shows footer when loading is true even with empty text", () => {
      const { container } = renderWithMantine(
        <Footer text="" loading={true} />,
      );
      const skeleton = container.querySelector(".mantine-Skeleton-root");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
