/**
 * PassportExportButtons Component
 *
 * The holder taking their record away: Markdown to read, a PDF to print
 * or hand over, and the zip bundle that carries everything including the
 * git history.
 *
 * **The bundle is the one that matters and is deliberately listed last.**
 * A PDF is what somebody reaches for first and is the least useful of the
 * three — it is a rendering, not the record. The zip holds the canonical
 * files byte for byte, a `README.md` written for somebody who has never
 * seen Quill, and `VERIFY.md` explaining how to check the hashes with no
 * software at all. The wording says so rather than leaving a holder to
 * discover it years later.
 *
 * **Reflections leave only when asked for.** The Markdown export takes a
 * parameter the backend defaults to off, because a rendering handed to a
 * panel or an employer must not carry one by accident and written
 * reflection can be disclosed in legal proceedings. There is no control
 * for it here: a deliberate act belongs behind a deliberate choice, and a
 * checkbox beside a download button is not that.
 *
 * @example
 * ```tsx
 * <PassportExportButtons passportId={passport.passport_id} />
 * ```
 */

import { useState } from "react";
import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import ErrorState from "@/components/error-state/ErrorState";
import { FieldDescription, Heading } from "@/components/typography";
import { exportBundle, exportMarkdown, exportPdf } from "@lib/passport";

/** Which download is in flight, so only that button shows a spinner. */
type Pending = "md" | "pdf" | "zip" | null;

export interface PassportExportButtonsProps {
  /** Whose passport to export. */
  passportId: string;
}

/**
 * Hands a blob to the browser as a saved file.
 *
 * The object URL is revoked immediately: it is only needed for the
 * duration of the click, and leaving it alive pins the whole file in
 * memory for the life of the tab.
 */
function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export default function PassportExportButtons({
  passportId,
}: PassportExportButtonsProps) {
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(
    kind: Exclude<Pending, null>,
    fetch: () => Promise<Blob>,
    extension: string,
  ) {
    setPending(kind);
    setError(null);

    try {
      save(await fetch(), `passport-${passportId}.${extension}`);
    } catch {
      setError("That download could not be prepared. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <BaseCard data-testid="passport-export-buttons">
      <Stack gap="md">
        <Heading>Take your record with you</Heading>

        <FieldDescription>
          Your passport belongs to you. Nothing here depends on Quill still
          existing.
        </FieldDescription>

        <Group justify="flex-end">
          <IconTextButton
            icon="download"
            label="Markdown"
            variant="outline"
            onClick={() =>
              download("md", () => exportMarkdown(passportId), "md")
            }
            loading={pending === "md"}
            disabled={pending !== null && pending !== "md"}
          />

          <IconTextButton
            icon="download"
            label="PDF"
            variant="outline"
            onClick={() => download("pdf", () => exportPdf(passportId), "pdf")}
            loading={pending === "pdf"}
            disabled={pending !== null && pending !== "pdf"}
          />

          <IconTextButton
            icon="download"
            label="Full bundle"
            onClick={() =>
              download("zip", () => exportBundle(passportId), "zip")
            }
            loading={pending === "zip"}
            disabled={pending !== null && pending !== "zip"}
          />
        </Group>

        <FieldDescription>
          The full bundle holds the record itself, the renderings, and its whole
          history — with a page explaining how to check it against the hashes.
        </FieldDescription>

        {error && <ErrorState message={error} />}
      </Stack>
    </BaseCard>
  );
}
