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
 * is addressed by the SHA-256 of its own bytes — which is what lets a
 * holder verify their record years later with nothing but a checksum
 * tool — so the address cannot be computed without reading every byte.
 * That is the whole reason the teaching videos' signed-URL pattern does
 * not apply here: a video is addressed by a generated id, so nobody has
 * to look inside it.
 *
 * @example
 * ```tsx
 * <CertificateUploader passportId={id} onUploaded={setAttachment} />
 * ```
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import MediaDropzone from "@/components/teaching/module-media-card/MediaDropzone";
import ErrorState from "@/components/error-state/ErrorState";
import { FieldDescription } from "@/components/typography";
import { uploadEvidence } from "@lib/passport";
import type { AttachmentInput } from "@lib/passport";
import { ACCEPTED_EVIDENCE_TYPES } from "./evidenceFormat";

export interface CertificateUploaderProps {
  /** Whose passport the evidence is stored against. */
  passportId: string;
  /** Called with the stored file, to be named in the record. */
  onUploaded: (attachment: AttachmentInput) => void;
}

export default function CertificateUploader({
  passportId,
  onUploaded,
}: CertificateUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDrop(file: File) {
    setUploading(true);
    setError(null);

    try {
      onUploaded(await uploadEvidence(passportId, file));
    } catch {
      // Deliberately not the thrown message: a storage failure's own
      // wording is about buckets and hashes, which tells a doctor
      // nothing they can act on.
      setError("That file could not be uploaded. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack gap="xs">
      <MediaDropzone
        onDrop={handleDrop}
        disabled={uploading}
        accept={ACCEPTED_EVIDENCE_TYPES}
        label={
          uploading ? "Uploading…" : "Drop a certificate or click to browse"
        }
      />

      <FieldDescription>
        A scan or photograph of the certificate. PDF, JPEG, PNG, HEIC or WebP.
      </FieldDescription>

      {error && <ErrorState message={error} />}
    </Stack>
  );
}
