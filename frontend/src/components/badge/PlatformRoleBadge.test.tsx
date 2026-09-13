/**
 * PlatformRoleBadge Component Tests
 *
 * The badge marks operators and stays silent about everyone else, so
 * most of these assert an absence. That is the point of the component:
 * the predecessor rendered one of four pills on every row, and three of
 * those said where someone worked rather than what they were.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PlatformRoleBadge from "./PlatformRoleBadge";

describe("PlatformRoleBadge", () => {
  describe("Operators", () => {
    it("displays SUPERADMIN for an operator", () => {
      renderWithMantine(<PlatformRoleBadge platformRole="superadmin" />);
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });

    it("uppercases the label", () => {
      renderWithMantine(<PlatformRoleBadge platformRole="superadmin" />);
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
      expect(screen.queryByText("superadmin")).not.toBeInTheDocument();
    });
  });

  describe("Everyone else", () => {
    it("renders no pill for a standard account", () => {
      renderWithMantine(<PlatformRoleBadge platformRole="standard" />);
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
      expect(screen.queryByText(/STANDARD/i)).not.toBeInTheDocument();
    });

    it("renders no pill when the role is missing", () => {
      renderWithMantine(<PlatformRoleBadge platformRole={undefined} />);
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
    });

    it("renders no pill for a retired permission level", () => {
      // `admin` and `staff` were rungs of `system_permissions`. Neither
      // may resurface as a pill now the ladder is gone.
      renderWithMantine(
        <PlatformRoleBadge platformRole={"admin" as unknown as "standard"} />,
      );
      expect(screen.queryByText("ADMIN")).not.toBeInTheDocument();
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
    });

    it("renders no pill for the staff rung either", () => {
      renderWithMantine(
        <PlatformRoleBadge platformRole={"staff" as unknown as "standard"} />,
      );
      expect(screen.queryByText("STAFF")).not.toBeInTheDocument();
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
    });
  });

  describe("Loading", () => {
    it("shows a skeleton instead of the pill while loading", () => {
      renderWithMantine(
        <PlatformRoleBadge platformRole="superadmin" isLoading />,
      );
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
    });
  });

  describe("Display variants", () => {
    it("renders with the light variant", () => {
      renderWithMantine(
        <PlatformRoleBadge platformRole="superadmin" variant="light" />,
      );
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });

    it("renders with the outline variant", () => {
      renderWithMantine(
        <PlatformRoleBadge platformRole="superadmin" variant="outline" />,
      );
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });
  });
});
