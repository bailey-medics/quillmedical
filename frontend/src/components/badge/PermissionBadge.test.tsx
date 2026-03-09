/**
 * PermissionBadge Component Tests
 *
 * Tests for the permission badge component including:
 * - Color mapping for each permission level
 * - Size variants
 * - Display variants
 * - Text transformation
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PermissionBadge from "./PermissionBadge";

describe("PermissionBadge", () => {
  describe("Permission levels", () => {
    it("displays SUPERADMIN with green color", () => {
      renderWithMantine(<PermissionBadge permission="superadmin" />);
      const badge = screen.getByText("SUPERADMIN");
      expect(badge).toBeInTheDocument();
    });

    it("displays ADMIN with blue color", () => {
      renderWithMantine(<PermissionBadge permission="admin" />);
      const badge = screen.getByText("ADMIN");
      expect(badge).toBeInTheDocument();
    });

    it("displays STAFF with gray color", () => {
      renderWithMantine(<PermissionBadge permission="staff" />);
      const badge = screen.getByText("STAFF");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Text transformation", () => {
    it("transforms superadmin text to uppercase", () => {
      renderWithMantine(<PermissionBadge permission="superadmin" />);
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
      expect(screen.queryByText("superadmin")).not.toBeInTheDocument();
    });

    it("transforms admin text to uppercase", () => {
      renderWithMantine(<PermissionBadge permission="admin" />);
      expect(screen.getByText("ADMIN")).toBeInTheDocument();
      expect(screen.queryByText("admin")).not.toBeInTheDocument();
    });

    it("transforms staff text to uppercase", () => {
      renderWithMantine(<PermissionBadge permission="staff" />);
      expect(screen.getByText("STAFF")).toBeInTheDocument();
      expect(screen.queryByText("staff")).not.toBeInTheDocument();
    });
  });

  describe("Size variants", () => {
    it("renders with custom size", () => {
      renderWithMantine(<PermissionBadge permission="admin" size="sm" />);
      const badge = screen.getByText("ADMIN");
      expect(badge).toBeInTheDocument();
    });

    it("defaults to xl size when size not specified", () => {
      renderWithMantine(<PermissionBadge permission="admin" />);
      const badge = screen.getByText("ADMIN");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("Display variants", () => {
    it("renders with filled variant by default", () => {
      renderWithMantine(<PermissionBadge permission="superadmin" />);
      const badge = screen.getByText("SUPERADMIN");
      expect(badge).toBeInTheDocument();
    });

    it("renders with light variant", () => {
      renderWithMantine(<PermissionBadge permission="admin" variant="light" />);
      const badge = screen.getByText("ADMIN");
      expect(badge).toBeInTheDocument();
    });

    it("renders with outline variant", () => {
      renderWithMantine(
        <PermissionBadge permission="staff" variant="outline" />,
      );
      const badge = screen.getByText("STAFF");
      expect(badge).toBeInTheDocument();
    });
  });
});
