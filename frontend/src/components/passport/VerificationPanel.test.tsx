/**
 * VerificationPanel Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import VerificationPanel from "./VerificationPanel";
import { changedVerification, unchangedVerification } from "./fixtures";

describe("VerificationPanel", () => {
  describe("Result", () => {
    it("says the record is unchanged when it matches", () => {
      renderWithMantine(
        <VerificationPanel verification={unchangedVerification} />,
      );
      expect(screen.getByText("This record is unchanged")).toBeInTheDocument();
    });

    it("says the record does not match when it has changed", () => {
      renderWithMantine(
        <VerificationPanel verification={changedVerification} />,
      );
      expect(
        screen.getByText("This record does not match its fingerprint"),
      ).toBeInTheDocument();
    });
  });

  describe("Both halves of the answer", () => {
    it("renders what the check shows", () => {
      renderWithMantine(
        <VerificationPanel verification={unchangedVerification} />,
      );
      expect(screen.getByText("What this shows")).toBeInTheDocument();
      expect(
        screen.getByText(unchangedVerification.proves),
      ).toBeInTheDocument();
    });

    it("renders what the check does not show", () => {
      // The limits matter as much as the result. Showing only the first
      // half would overstate what a hash match establishes.
      renderWithMantine(
        <VerificationPanel verification={unchangedVerification} />,
      );
      expect(screen.getByText("What this does not show")).toBeInTheDocument();
      expect(
        screen.getByText(unchangedVerification.does_not_prove),
      ).toBeInTheDocument();
    });

    it("still states the limits when the record has changed", () => {
      renderWithMantine(
        <VerificationPanel verification={changedVerification} />,
      );
      expect(screen.getByText("What this does not show")).toBeInTheDocument();
    });
  });

  describe("Content hash", () => {
    it("renders the hash when there is one", () => {
      renderWithMantine(
        <VerificationPanel verification={unchangedVerification} />,
      );
      expect(screen.getByText("sha256:7f4e9a21bc0d")).toBeInTheDocument();
    });

    it("omits the hash section when there is none", () => {
      renderWithMantine(
        <VerificationPanel
          verification={{ ...unchangedVerification, content_hash: null }}
        />,
      );
      expect(screen.queryByText("Content hash")).not.toBeInTheDocument();
    });
  });
});
