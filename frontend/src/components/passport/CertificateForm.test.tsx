/**
 * CertificateForm Tests
 *
 * The rules worth pinning are the ones a later change could quietly
 * break: that a certificate never implies a countersignature, that an
 * attachment travels with the record it evidences, and that expiry is
 * recorded without being required.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import CertificateForm from "./CertificateForm";
import { certificates } from "./fixtures";
import type { AttachmentInput } from "@lib/passport";

const uploaded: AttachmentInput = {
  hash: "sha256:" + "ab".repeat(32),
  filename: "als-certificate.pdf",
  size_bytes: 184320,
  media_type: "application/pdf",
};

/**
 * Fills the three required fields, which is the least that submits.
 *
 * The date is picked from the calendar rather than typed. `DateField`
 * renders `D MMMM YYYY`, so a typed `2026-03-14` parses to nothing, the
 * value stays null and the submit button stays disabled - which shows up
 * as a timeout on the click rather than a failed assertion.
 *
 * Which day is picked is deliberately not pinned: the calendar opens on
 * the current month, so naming one would tie the test to the date it was
 * written. What matters is that a date was chosen at all.
 */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: /What is it/ }),
    "Advanced life support",
  );
  await user.type(
    screen.getByRole("textbox", { name: /Who issued it/ }),
    "Resuscitation Council UK",
  );

  await user.click(screen.getByRole("textbox", { name: /Awarded on/ }));

  // By `aria-label`, not by the digits shown. The calendar renders the
  // tail of the previous month and the head of the next, so "1" matches
  // three buttons; the label is the only unambiguous handle.
  await user.click(screen.getByRole("button", { name: labelForToday() }));
}

/** Today as the calendar labels it, e.g. "15 September 2026". */
function labelForToday(): string {
  return new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

describe("CertificateForm", () => {
  it("names what it is recording", () => {
    renderWithMantine(<CertificateForm onSubmit={vi.fn()} />);

    expect(screen.getByText("Record a certificate")).toBeInTheDocument();
  });

  it("will not submit without what, who and when", () => {
    renderWithMantine(<CertificateForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Record certificate" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("submits once the three required fields are filled", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<CertificateForm onSubmit={onSubmit} />);

    await fillRequired(user);
    await user.click(
      screen.getByRole("button", { name: "Record certificate" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Advanced life support",
        issuer: "Resuscitation Council UK",
        // The day comes from whichever month the calendar opened on, so
        // the shape is what is pinned rather than the value.
        awarded_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it("carries the attachment through to the record", async () => {
    // The upload response is the only org_unit the filename and media type
    // exist: a blob is bytes at a path named by their hash, and nothing
    // beside it records what the file was called.
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(
      <CertificateForm onSubmit={onSubmit} attachments={[uploaded]} />,
    );

    await fillRequired(user);
    await user.click(
      screen.getByRole("button", { name: "Record certificate" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [uploaded] }),
    );
  });

  it("sends no attachments when nothing is attached", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<CertificateForm onSubmit={onSubmit} />);

    await fillRequired(user);
    await user.click(
      screen.getByRole("button", { name: "Record certificate" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    );
  });

  it("shows the holder which file is attached", () => {
    renderWithMantine(
      <CertificateForm onSubmit={vi.fn()} attachments={[uploaded]} />,
    );

    expect(screen.getByText("als-certificate.pdf")).toBeInTheDocument();
  });

  it("submits without an expiry date", async () => {
    // Plenty of certificates never expire, and plenty of people practise
    // safely with a lapsed one. Requiring it would invent a rule.
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithMantine(<CertificateForm onSubmit={onSubmit} />);

    await fillRequired(user);
    await user.click(
      screen.getByRole("button", { name: "Record certificate" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ expires_on: null }),
    );
  });

  it("implies no countersignature", () => {
    // A certificate is the holder's own claim. Any wording suggesting a
    // second person accepted accountability would blur it with a
    // sign-off, which is the one distinction the passport keeps hardest.
    renderWithMantine(<CertificateForm onSubmit={vi.fn()} />);

    expect(screen.queryByText(/declaration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/assessor/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers a way out", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithMantine(
      <CertificateForm onSubmit={vi.fn()} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });

  describe("Editing", () => {
    it("starts filled in from the certificate", () => {
      renderWithMantine(
        <CertificateForm onSubmit={vi.fn()} initial={certificates[0]} />,
      );

      expect(screen.getByRole("textbox", { name: /What is it/ })).toHaveValue(
        "Advanced life support",
      );
      expect(screen.getByText("Edit this certificate")).toBeInTheDocument();
    });

    it("offers to remove the file, and says so when pressed", async () => {
      const user = userEvent.setup();
      const onRemoveAttachment = vi.fn();
      renderWithMantine(
        <CertificateForm
          onSubmit={vi.fn()}
          attachments={[uploaded]}
          onRemoveAttachment={onRemoveAttachment}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Remove als-certificate.pdf" }),
      );

      expect(onRemoveAttachment).toHaveBeenCalledWith(uploaded.hash);
    });

    it("lists every file, each with its own remove button", async () => {
      const user = userEvent.setup();
      const onRemoveAttachment = vi.fn();
      const second: AttachmentInput = {
        ...uploaded,
        hash: "sha256:" + "cd".repeat(32),
        filename: "als-transcript.pdf",
      };
      renderWithMantine(
        <CertificateForm
          onSubmit={vi.fn()}
          attachments={[uploaded, second]}
          onRemoveAttachment={onRemoveAttachment}
        />,
      );

      expect(screen.getByText("als-certificate.pdf")).toBeInTheDocument();
      expect(screen.getByText("als-transcript.pdf")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Remove als-transcript.pdf" }),
      );

      expect(onRemoveAttachment).toHaveBeenCalledWith(second.hash);
    });

    it("offers no remove button when nobody handles it", () => {
      renderWithMantine(
        <CertificateForm onSubmit={vi.fn()} attachments={[uploaded]} />,
      );

      expect(
        screen.queryByRole("button", { name: /Remove/ }),
      ).not.toBeInTheDocument();
    });

    it("shows an upload box at the foot, above the file", () => {
      renderWithMantine(
        <CertificateForm
          onSubmit={vi.fn()}
          attachments={[uploaded]}
          uploader={<div>Upload box</div>}
        />,
      );

      const box = screen.getByText("Upload box");
      const file = screen.getByText("als-certificate.pdf");
      const description = screen.getByRole("textbox", { name: /Description/ });
      expect(
        description.compareDocumentPosition(box) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        box.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
