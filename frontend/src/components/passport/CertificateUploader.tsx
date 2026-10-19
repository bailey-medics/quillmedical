/**
 * CertificateUploader Component
 *
 * Puts one scanned certificate into the blob store and hands back what
 * a record needs to name it.
 *
 * **Uploading is separate from the form on purpose.** A network drop
 * halfway through a scan must not cost somebody a filled-in
 * `CertificateForm`, so the two are composed by the page rather than
 * nested: this one owns the file and its failures, the form owns the
 * fields, and the only thing crossing between them is a finished
 * attachment.
 *
 * **The upload goes through Quill, not straight to a bucket.** Evidence
 * is addressed by the SHA-256 of its own bytes - which is what lets a
 * holder verify their record years later with nothing but a checksum
 * tool - so the address cannot be computed without reading every byte.
 * That is the whole reason the teaching videos' signed-URL pattern does
 * not apply here: a video is addressed by a generated id, so nobody has
 * to look inside it.
 *
 * **Uploaded is not yet attached.** Every file is scanned for malware
 * before it can be shown, so after the upload this asks where the scan
 * has got to every few seconds, and hands the file to the form only once
 * it is clean. A file the scan finds something in is never handed over,
 * and the drop area says so. A scan with no verdict after two minutes is
 * handed over anyway, so a slow scan does not stop a save: it is still
 * held back wherever it would be shown, and the save refuses it if the
 * verdict turns out to be malware.
 *
 * @example
 * ```tsx
 * <CertificateUploader passportId={id} onUploaded={setAttachment} />
 * ```
 */

import { useEffect, useRef, useState } from "react";
import { Stack } from "@mantine/core";
import MediaDropzone from "@/components/media-dropzone";
import ErrorState from "@/components/error-state/ErrorState";
import { FieldDescription } from "@/components/typography";
import { fetchEvidenceScan, uploadEvidence } from "@lib/passport";
import type { AttachmentInput } from "@lib/passport";
import EvidenceScanStatus, {
  type EvidenceScanStatusName,
} from "./EvidenceScanStatus";
import { ACCEPTED_EVIDENCE_TYPES } from "./evidenceFormat";

/** How often the scan is asked about while it is running. */
export const SCAN_POLL_MS = 3000;

/** How long the uploader waits for a verdict before attaching anyway. */
export const SCAN_PATIENCE_MS = 120_000;

/**
 * What to say when an upload fails.
 *
 * A refusal (400) or a file too large (413) carries the backend's own
 * reason, written for the person uploading: the file is empty, is not
 * the type it claims to be, is a PDF that runs something, or is an
 * image that cannot be read. Uploading it again will not help, so the
 * reason is what they need. Anything else is a fault on the way, a
 * network or storage failure whose own wording is about buckets and
 * hashes, so it is not shown, and trying again is the right advice.
 */
function uploadFailure(err: unknown): string {
  const status =
    err instanceof Error && "status" in err ? err.status : undefined;

  if ((status === 400 || status === 413) && err instanceof Error) {
    return err.message;
  }

  return "That file could not be uploaded. Please try again.";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CertificateUploaderProps {
  /** Whose passport the evidence is stored against. */
  passportId: string;
  /** Called with the stored file, to be named in the record. */
  onUploaded: (attachment: AttachmentInput) => void;
  /**
   * Whether a second file joins the first rather than replacing it,
   * which is what editing a certificate does. Only the wording changes:
   * what happens to the file is the page's to decide.
   */
  adds?: boolean;
}

export default function CertificateUploader({
  passportId,
  onUploaded,
  adds = false,
}: CertificateUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown here, beside the box that was used, rather than left to the
  // form below. The form's own line sits under the description field,
  // off-screen on a phone, so an upload that worked looked like a press
  // that did nothing.
  const [scan, setScan] = useState<{
    status: EvidenceScanStatusName;
    filename: string;
    signature?: string | null;
  } | null>(null);
  // Bumped by each drop and by unmounting, so a scan still being asked
  // about for an earlier file stops rather than overwriting the newer one.
  const attempt = useRef(0);

  useEffect(() => {
    return () => {
      attempt.current += 1;
    };
  }, []);

  async function handleDrop(file: File) {
    const mine = ++attempt.current;
    setUploading(true);
    setError(null);
    setScan(null);

    let stored: AttachmentInput;

    try {
      stored = await uploadEvidence(passportId, file);
    } catch (err) {
      setError(uploadFailure(err));
      setUploading(false);
      return;
    }

    setScan({ status: "checking", filename: stored.filename });

    const deadline = Date.now() + SCAN_PATIENCE_MS;

    while (attempt.current === mine) {
      let state: string;
      let signature: string | null = null;

      try {
        const answer = await fetchEvidenceScan(passportId, stored.hash);
        state = answer.scan_state;
        signature = answer.signature;
      } catch {
        // A blip asking about the scan is not a verdict: ask again.
        state = "pending";
      }

      if (attempt.current !== mine) {
        return;
      }

      if (state === "clean") {
        setScan({ status: "attached", filename: stored.filename });
        onUploaded(stored);
        break;
      }

      if (state === "infected") {
        setScan({ status: "malware", filename: stored.filename, signature });
        break;
      }

      if (state === "failed") {
        setScan({ status: "failed", filename: stored.filename });
        break;
      }

      if (Date.now() >= deadline) {
        setScan({ status: "slow", filename: stored.filename });
        onUploaded(stored);
        break;
      }

      await wait(SCAN_POLL_MS);
    }

    if (attempt.current === mine) {
      setUploading(false);
    }
  }

  const checking = scan?.status === "checking";
  const attached = scan?.status === "attached" || scan?.status === "slow";

  return (
    <Stack gap="xs">
      <MediaDropzone
        onDrop={handleDrop}
        onReject={() =>
          setError(
            "That file cannot be attached. Use a PDF, JPEG, PNG, HEIC or WebP.",
          )
        }
        disabled={uploading}
        accept={ACCEPTED_EVIDENCE_TYPES}
        label={
          checking
            ? "Scanning…"
            : uploading
              ? "Uploading…"
              : attached
                ? adds
                  ? "Drop another to add it"
                  : "Drop another to replace it"
                : "Drop a certificate or click to browse"
        }
      />

      {scan && (
        <EvidenceScanStatus
          status={scan.status}
          filename={scan.filename}
          signature={scan.signature}
        />
      )}

      <FieldDescription>
        A scan or photograph of the certificate. PDF, JPEG, PNG, HEIC or WebP.
        Never a file that could identify a patient.
      </FieldDescription>

      {error && <ErrorState message={error} />}
    </Stack>
  );
}
