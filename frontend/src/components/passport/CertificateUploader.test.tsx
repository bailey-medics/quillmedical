/**
 * CertificateUploader Tests
 *
 * What matters here is the failure path. A successful upload is visible
 * the moment the filename appears on the form; a failed one is silent
 * unless the component says so, and a doctor who thinks their scan is
 * attached when it is not has a worse record than one who knows it is
 * missing.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import CertificateUploader from "./CertificateUploader";
import { ACCEPTED_EVIDENCE_TYPES } from "./evidenceFormat";

const uploadEvidence = vi.fn();

vi.mock("@lib/passport", () => ({
  uploadEvidence: (...args: unknown[]) => uploadEvidence(...args),
}));

const stored = {
  hash: "sha256:" + "ab".repeat(32),
  filename: "als-certificate.pdf",
  size_bytes: 184320,
  media_type: "application/pdf",
};

function drop(container: HTMLElement, file: File) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;

  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CertificateUploader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invites a certificate rather than a video", () => {
    renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    expect(
      screen.getByText("Drop a certificate or click to browse"),
    ).toBeInTheDocument();
  });

  it("accepts the types the backend will store", () => {
    // Pinned against ALLOWED_EVIDENCE_TYPES on the backend. Drift is
    // silent until an upload is refused at the last step.
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      "accept",
      ACCEPTED_EVIDENCE_TYPES.join(","),
    );
  });

  it("hands the stored file up once it is uploaded", async () => {
    const onUploaded = vi.fn();
    uploadEvidence.mockResolvedValue(stored);
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(stored);
    });
  });

  it("uploads against the passport it was given", async () => {
    uploadEvidence.mockResolvedValue(stored);
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(uploadEvidence).toHaveBeenCalledWith("3f2a8c1e", expect.any(File));
    });
  });

  it("says so when the upload fails", async () => {
    uploadEvidence.mockRejectedValue(new Error("network"));
    const onUploaded = vi.fn();
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));

    expect(
      await screen.findByText(/could not be uploaded/),
    ).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
