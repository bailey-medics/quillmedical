/**
 * CertificateUploader Tests
 *
 * What matters here is that every outcome is visible. A doctor who
 * thinks their scan is attached when it is not has a worse record than
 * one who knows it is missing, and one who cannot tell that it worked
 * uploads it again.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import CertificateUploader, {
  SCAN_PATIENCE_MS,
  SCAN_POLL_MS,
} from "./CertificateUploader";
import { ACCEPTED_EVIDENCE_TYPES } from "./evidenceFormat";
import type * as passportLib from "@lib/passport";

const { uploadEvidence, fetchEvidenceScan } = vi.hoisted(() => ({
  uploadEvidence: vi.fn<typeof passportLib.uploadEvidence>(),
  fetchEvidenceScan: vi.fn<typeof passportLib.fetchEvidenceScan>(),
}));

vi.mock("@lib/passport", () => ({
  uploadEvidence,
  fetchEvidenceScan,
}));

const clean = { scan_state: "clean" as const, signature: null };
const pending = { scan_state: "pending" as const, signature: null };

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
    fetchEvidenceScan.mockResolvedValue(clean);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invites a certificate rather than a video", () => {
    renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    expect(
      screen.getByText("Drop a certificate or click to browse"),
    ).toBeInTheDocument();
  });

  it("warns against a file that could identify a patient", () => {
    // The only place a file enters a passport, so a scanned prescription
    // or a clinic letter would arrive here.
    renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    expect(
      screen.getByText(/Never a file that could identify a patient/),
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

  it("says which file is attached once it is uploaded", async () => {
    uploadEvidence.mockResolvedValue(stored);
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));

    expect(
      await screen.findByText("Attached: als-certificate.pdf"),
    ).toBeInTheDocument();
    expect(screen.getByText("Drop another to replace it")).toBeInTheDocument();
  });

  it("says it is checking for malware, not attached, while the scan runs", async () => {
    uploadEvidence.mockResolvedValue(stored);
    fetchEvidenceScan.mockResolvedValue(pending);
    const onUploaded = vi.fn();
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));

    expect(
      await screen.findByText("Scanning als-certificate.pdf…"),
    ).toBeInTheDocument();
    expect(screen.getByText("Scanning…")).toBeInTheDocument();
    expect(screen.queryByText(/^Attached/)).not.toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(fetchEvidenceScan).toHaveBeenCalledWith("3f2a8c1e", stored.hash);
  });

  it("attaches the file once a running scan comes back clean", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    uploadEvidence.mockResolvedValue(stored);
    fetchEvidenceScan
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(clean);
    const onUploaded = vi.fn();
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));
    await screen.findByText("Scanning als-certificate.pdf…");
    await act(() => vi.advanceTimersByTimeAsync(SCAN_POLL_MS));

    expect(
      await screen.findByText("Attached: als-certificate.pdf"),
    ).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(stored);
  });

  it("says malware was found and never attaches the file", async () => {
    uploadEvidence.mockResolvedValue({ ...stored, filename: "eicar.pdf" });
    fetchEvidenceScan.mockResolvedValue({
      scan_state: "infected",
      signature: "Eicar-Signature",
    });
    const onUploaded = vi.fn();
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["x"], "eicar.pdf", { type: "application/pdf" }));

    expect(
      await screen.findByText(
        "Malware was found in eicar.pdf (Eicar-Signature). It has been deleted and is not attached.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Attached/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Drop a certificate or click to browse"),
    ).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("asks for the file again when the scan could not check it", async () => {
    uploadEvidence.mockResolvedValue(stored);
    fetchEvidenceScan.mockResolvedValue({
      scan_state: "failed",
      signature: null,
    });
    const onUploaded = vi.fn();
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));

    expect(
      await screen.findByText(/could not be checked for malware/),
    ).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("attaches the file anyway when the scan is slow, and says so", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    uploadEvidence.mockResolvedValue(stored);
    fetchEvidenceScan.mockResolvedValue(pending);
    const onUploaded = vi.fn();
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={onUploaded} />,
    );

    drop(container, new File(["scan"], "als.pdf", { type: "application/pdf" }));
    await screen.findByText("Scanning als-certificate.pdf…");
    await act(() =>
      vi.advanceTimersByTimeAsync(SCAN_PATIENCE_MS + SCAN_POLL_MS),
    );

    expect(await screen.findByText(/Still scanning/)).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(stored);
  });

  it("says so when the file is the wrong type", async () => {
    const { container } = renderWithMantine(
      <CertificateUploader passportId="3f2a8c1e" onUploaded={vi.fn()} />,
    );

    drop(container, new File(["notes"], "notes.txt", { type: "text/plain" }));

    expect(
      await screen.findByText(/That file cannot be attached/),
    ).toBeInTheDocument();
    expect(uploadEvidence).not.toHaveBeenCalled();
  });
});
