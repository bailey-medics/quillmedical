/**
 * SignOffStatusBadge Component Tests
 *
 * Covers all four sign-off states, their exclusivity, and loading.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SignOffStatusBadge from "./SignOffStatusBadge";

describe("SignOffStatusBadge", () => {
  describe("Status states", () => {
    it("renders 'Requested' for a requested sign-off", () => {
      renderWithMantine(<SignOffStatusBadge status="requested" />);
      expect(screen.getByText("Requested")).toBeInTheDocument();
    });

    it("renders 'Signed off' for a signed-off sign-off", () => {
      renderWithMantine(<SignOffStatusBadge status="signed_off" />);
      expect(screen.getByText("Signed off")).toBeInTheDocument();
    });

    it("renders 'Declined' for a declined sign-off", () => {
      renderWithMantine(<SignOffStatusBadge status="declined" />);
      expect(screen.getByText("Declined")).toBeInTheDocument();
    });

    it("renders 'Superseded' for a superseded sign-off", () => {
      renderWithMantine(<SignOffStatusBadge status="superseded" />);
      expect(screen.getByText("Superseded")).toBeInTheDocument();
    });
  });

  describe("Exclusivity", () => {
    it("shows only the signed-off label when signed off", () => {
      renderWithMantine(<SignOffStatusBadge status="signed_off" />);
      expect(screen.queryByText("Requested")).not.toBeInTheDocument();
      expect(screen.queryByText("Declined")).not.toBeInTheDocument();
      expect(screen.queryByText("Superseded")).not.toBeInTheDocument();
    });

    it("shows only the declined label when declined", () => {
      renderWithMantine(<SignOffStatusBadge status="declined" />);
      expect(screen.queryByText("Signed off")).not.toBeInTheDocument();
      expect(screen.queryByText("Requested")).not.toBeInTheDocument();
    });
  });

  describe("Vocabulary", () => {
    it("never borrows the teaching assessment wording", () => {
      // A clinical sign-off is not a pass, and must never read as one.
      renderWithMantine(<SignOffStatusBadge status="signed_off" />);
      expect(screen.queryByText("Pass")).not.toBeInTheDocument();
    });

    it("never reads a decline as a fail", () => {
      renderWithMantine(<SignOffStatusBadge status="declined" />);
      expect(screen.queryByText("Fail")).not.toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows a skeleton instead of the badge", () => {
      const { container } = renderWithMantine(
        <SignOffStatusBadge status="signed_off" isLoading />,
      );
      expect(screen.queryByText("Signed off")).not.toBeInTheDocument();
      expect(
        container.querySelector(".mantine-Skeleton-root"),
      ).toBeInTheDocument();
    });
  });
});
