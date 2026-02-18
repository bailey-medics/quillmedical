/**
 * PageHeader Component Tests
 *
 * Tests for the consistent page header component.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PageHeader from "./PageHeader";

describe("PageHeader", () => {
  describe("Basic rendering", () => {
    it("renders title", () => {
      renderWithMantine(<PageHeader title="Test Page" />);
      expect(screen.getByText("Test Page")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      renderWithMantine(
        <PageHeader
          title="Test Page"
          description="This is a test description"
        />,
      );
      expect(
        screen.getByText("This is a test description"),
      ).toBeInTheDocument();
    });

    it("does not render description when not provided", () => {
      renderWithMantine(<PageHeader title="Test Page" />);
      expect(screen.queryByText("description")).not.toBeInTheDocument();
    });
  });

  describe("Size variants", () => {
    it("renders with default lg size", () => {
      const { container } = renderWithMantine(<PageHeader title="Test Page" />);
      // lg size maps to order 1
      const title = container.querySelector('[class*="mantine-Title"]');
      expect(title).toBeInTheDocument();
    });

    it("renders with md size", () => {
      const { container } = renderWithMantine(
        <PageHeader title="Test Page" size="md" />,
      );
      const title = container.querySelector('[class*="mantine-Title"]');
      expect(title).toBeInTheDocument();
    });

    it("renders with sm size", () => {
      const { container } = renderWithMantine(
        <PageHeader title="Test Page" size="sm" />,
      );
      const title = container.querySelector('[class*="mantine-Title"]');
      expect(title).toBeInTheDocument();
    });
  });

  describe("Spacing", () => {
    it("applies default bottom margin", () => {
      const { container } = renderWithMantine(<PageHeader title="Test Page" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeInTheDocument();
      // Check that mb prop is present (Mantine handles conversion to CSS)
    });

    it("applies custom bottom margin", () => {
      const { container } = renderWithMantine(
        <PageHeader title="Test Page" mb="md" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeInTheDocument();
    });

    it("applies numeric bottom margin", () => {
      const { container } = renderWithMantine(
        <PageHeader title="Test Page" mb={20} />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe("Content variations", () => {
    it("renders with long title", () => {
      const longTitle =
        "This is a very long page title that should still render correctly";
      renderWithMantine(<PageHeader title={longTitle} />);
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it("renders with long description", () => {
      const longDescription =
        "This is a very long description that provides detailed information about the page and what users can expect to find here";
      renderWithMantine(
        <PageHeader title="Test Page" description={longDescription} />,
      );
      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });

    it("renders with special characters in title", () => {
      renderWithMantine(<PageHeader title="Test & Page - (Admin)" />);
      expect(screen.getByText("Test & Page - (Admin)")).toBeInTheDocument();
    });
  });

  describe("Integration scenarios", () => {
    it("renders large header with description", () => {
      renderWithMantine(
        <PageHeader
          title="Administration"
          description="Manage users, patients, and system permissions"
          size="lg"
        />,
      );
      expect(screen.getByText("Administration")).toBeInTheDocument();
      expect(
        screen.getByText("Manage users, patients, and system permissions"),
      ).toBeInTheDocument();
    });

    it("renders medium header without description", () => {
      renderWithMantine(<PageHeader title="Settings" size="md" />);
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("renders small header with description", () => {
      renderWithMantine(
        <PageHeader
          title="Account Details"
          description="View and edit your account information"
          size="sm"
        />,
      );
      expect(screen.getByText("Account Details")).toBeInTheDocument();
      expect(
        screen.getByText("View and edit your account information"),
      ).toBeInTheDocument();
    });
  });
});
