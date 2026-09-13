/**
 * SignOffCard Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SignOffCard from "./SignOffCard";
import { requested, signedOff } from "./fixtures";

describe("SignOffCard", () => {
  describe("Content", () => {
    it("renders the competency name and level", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("Perform bronchoscopy")).toBeInTheDocument();
      expect(screen.getByText("Can perform independently")).toBeInTheDocument();
    });

    it("renders the status badge", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("Signed off")).toBeInTheDocument();
    });

    it("renders the assessor's name and role", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(
        screen.getByText(/Dr Amara Okonkwo — Consultant respiratory physician/),
      ).toBeInTheDocument();
    });

    it("renders the assessor's registration", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("GMC 7654321")).toBeInTheDocument();
    });

    it("renders the comments", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(
        screen.getByText(/Ready to proceed unsupervised/),
      ).toBeInTheDocument();
    });

    it("renders the content hash, so a printed record can be checked", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("sha256:7f4e9a21bc0d")).toBeInTheDocument();
    });
  });

  describe("Three clocks kept apart", () => {
    it("labels the observed date and the signed date separately", () => {
      // Presenting one as the other is the mistake the plan warns against.
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("Observed on")).toBeInTheDocument();
      expect(screen.getByText("Signed")).toBeInTheDocument();
    });

    it("omits the signed date while a sign-off is only requested", () => {
      renderWithMantine(<SignOffCard signOff={requested} />);
      expect(screen.getByText("Observed on")).toBeInTheDocument();
      expect(screen.queryByText("Signed")).not.toBeInTheDocument();
    });
  });

  describe("What the assessor did", () => {
    it("records the basis of the judgement", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("Basis")).toBeInTheDocument();
      expect(screen.getByText("directly observed")).toBeInTheDocument();
    });

    it("names the kind when it is not the first sign-off", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("progression")).toBeInTheDocument();
    });

    it("does not label an initial sign-off with its kind", () => {
      renderWithMantine(<SignOffCard signOff={requested} />);
      expect(screen.queryByText("initial")).not.toBeInTheDocument();
    });
  });

  describe("Evidence", () => {
    it("reports what was in front of the assessor, with no target", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(
        screen.getByText(/38 logbook entries, 1 certificate/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("lists attachments by filename", () => {
      renderWithMantine(<SignOffCard signOff={signedOff} />);
      expect(screen.getByText("dops-form.pdf")).toBeInTheDocument();
    });

    it("omits the evidence and attachment sections when there are none", () => {
      renderWithMantine(<SignOffCard signOff={requested} />);
      expect(screen.queryByText("Evidence at signing")).not.toBeInTheDocument();
      expect(screen.queryByText("Attachments")).not.toBeInTheDocument();
    });
  });

  describe("Unsigned records", () => {
    it("shows no assessor block before anybody has signed", () => {
      renderWithMantine(<SignOffCard signOff={requested} />);
      expect(screen.queryByText("Signed off by")).not.toBeInTheDocument();
    });
  });
});
