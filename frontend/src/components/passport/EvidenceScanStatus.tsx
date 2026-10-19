/**
 * EvidenceScanStatus Component
 *
 * The line beneath an evidence drop area saying what became of the file
 * just dropped. Every upload is scanned for malware before it can be
 * shown, so "uploaded" is not yet "attached": this says which.
 *
 * Written after the first malware test in App production, where the drop
 * area said "Attached: eicar-in-a-pdf.pdf" for a file the scan had
 * already found and deleted.
 *
 * Presentational only: `CertificateUploader` asks where the scan has got
 * to and passes the answer here, so each state can be shown in a story.
 *
 * @example
 * ```tsx
 * <EvidenceScanStatus status="checking" filename="als.pdf" />
 * ```
 */

import { Group } from "@mantine/core";
import ErrorState from "@/components/error-state/ErrorState";
import Icon from "@/components/icons/Icon";
import { IconCircleCheck, IconClock } from "@/components/icons/appIcons";
import { QuillSpinner } from "@/components/loading-spinner";
import { BodyTextInline } from "@/components/typography";

/**
 * Where an uploaded file has got to, as the drop area shows it.
 *
 * `slow` is a scan with no verdict after the uploader stopped waiting:
 * the file is attached so a slow scan does not stop a save, and it is
 * still held back wherever it would be shown until it passes.
 */
export type EvidenceScanStatusName =
  "checking" | "attached" | "slow" | "malware" | "failed";

export interface EvidenceScanStatusProps {
  /** Where the file has got to. */
  status: EvidenceScanStatusName;
  /** The name the file was uploaded with. */
  filename: string;
  /** What the scan called what it found, for `malware`. */
  signature?: string | null;
}

export default function EvidenceScanStatus({
  status,
  filename,
  signature,
}: EvidenceScanStatusProps) {
  if (status === "malware") {
    const found = signature ? ` (${signature})` : "";

    return (
      <ErrorState
        title="Malware found"
        message={`Malware was found in ${filename}${found}. It has been deleted and is not attached.`}
      />
    );
  }

  if (status === "failed") {
    return (
      <ErrorState
        title="Not checked"
        message={`${filename} could not be checked for malware, so it is not attached. Upload it again.`}
      />
    );
  }

  if (status === "checking") {
    return (
      <Group gap="xs" wrap="nowrap">
        <QuillSpinner size="1.5rem" />
        <BodyTextInline>Scanning {filename}…</BodyTextInline>
      </Group>
    );
  }

  if (status === "slow") {
    return (
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Icon icon={<IconClock />} />
        <BodyTextInline>
          Attached: {filename}. Still scanning; it will be shown once it passes.
        </BodyTextInline>
      </Group>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Icon icon={<IconCircleCheck />} />
      <BodyTextInline>Attached: {filename}</BodyTextInline>
    </Group>
  );
}
