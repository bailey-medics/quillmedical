/**
 * Passport Certificate Page
 *
 * One certificate in full, reached by choosing it in the certificates
 * table, with an edit button that turns the card into the certificate
 * form filled in from it.
 *
 * Laid out as every passport record page is: the section and the
 * record's name as the title, the edit button on the right, then the
 * record card or, while editing, the form in its place.
 *
 * Beneath the card, each attached file is shown by `Document`, the
 * viewer clinic letters use: a PDF in the browser's own viewer on a
 * desktop and drawn page by page on a phone or tablet, an image as it
 * is. The file comes from the API through the certificate, never by its
 * hash alone.
 *
 * Read from the list of certificates rather than a route of its own, as
 * the logbook and CPD record pages read theirs. What the form does not
 * show, the competencies the certificate supports and its attachments,
 * is sent back unchanged or kept by the server, so correcting a title
 * cannot lose them.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import { Document } from "@/components/documents";
import CertificateForm from "@/components/passport/CertificateForm";
import CertificateUploader from "@/components/passport/CertificateUploader";
import PassportRecordCard from "@/components/passport/PassportRecordCard";
import { IconFileText } from "@/components/icons/appIcons";
import {
  amendCertificate,
  certificateAttachmentUrl,
  fetchCertificates,
  fetchMyPassport,
} from "@lib/passport";
import type {
  Attachment,
  AttachmentInput,
  Certificate,
  CertificateInput,
} from "@lib/passport";

/**
 * How `Document` should show an attachment. HEIC, the format iPhones
 * save photographs in, is left to `Document`'s download link, because
 * only Safari can draw one.
 */
function documentType(attachment: Attachment): "pdf" | "image" | "other" {
  if (attachment.media_type === "application/pdf") return "pdf";
  if (attachment.media_type === "image/heic") return "other";
  if (attachment.media_type.startsWith("image/")) return "image";
  return "other";
}

export function Component() {
  const { name } = useParams<{ name: string }>();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // The files as they will be saved: those on the record when editing
  // starts, less any the holder removes, plus any they upload. Kept apart
  // from the certificate so cancelling leaves the record as it was, and a
  // list so a certificate with several files keeps every one.
  const [files, setFiles] = useState<AttachmentInput[]>([]);

  const load = useCallback(
    async (id: string) => {
      const found = (await fetchCertificates(id)).find(
        (item) => item.name === name,
      );
      if (found) setCertificate(found);
      else setMissing(true);
    },
    [name],
  );

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return load(id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That certificate could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  function startEditing() {
    setFiles(certificate?.attachments ?? []);
    setEditing(true);
  }

  async function handleSave(data: CertificateInput) {
    if (!passportId || !name || !certificate) return;

    setSaving(true);
    try {
      await amendCertificate(passportId, name, {
        ...data,
        // Not on the form, so sent back as they were rather than cleared.
        competencies: certificate.competencies.map((c) => c.id),
        // Always sent while editing, so the server replaces the files
        // with exactly these: an empty list removes them all.
        attachments: files,
      });
      await load(passportId);
      setEditing(false);
      setError(null);
    } catch {
      setError("Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const title = `Certificates: ${certificate?.title ?? "certificate"}`;

  // Only a failed load replaces the page. A failed save keeps the
  // certificate on screen, with the message above it.
  if (error && !certificate) {
    return (
      <Stack gap="lg">
        <PageHeader title={title} />
        <ErrorState message={error} />
      </Stack>
    );
  }

  if (missing) {
    return (
      <Stack gap="lg">
        <PageHeader title={title} />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="That certificate is not here"
          description="It may have been removed, or the link may be wrong."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={title} />

      {error && <ErrorState message={error} />}

      {certificate && editing && passportId && (
        <CertificateForm
          initial={certificate}
          attachments={files}
          onRemoveAttachment={(hash) =>
            setFiles((current) => current.filter((f) => f.hash !== hash))
          }
          // At the foot of the form, beside the files and their remove
          // buttons, so changing them is done in one place. A file dropped
          // here joins the others; the same file twice is kept once.
          uploader={
            <CertificateUploader
              passportId={passportId}
              adds
              onUploaded={(stored) =>
                setFiles((current) =>
                  current.some((f) => f.hash === stored.hash)
                    ? current
                    : [...current, stored],
                )
              }
            />
          }
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          isSubmitting={saving}
        />
      )}

      {certificate && !editing && (
        <>
          <Group justify="flex-end">
            {/* Disabled where the server says a write would be refused,
                rather than offering a control that fails on save. */}
            <IconTextButton
              icon="pencil"
              label="Edit certificate"
              onClick={startEditing}
              disabled={!canWrite}
            />
          </Group>

          <PassportRecordCard
            date={certificate.awarded_on}
            facts={[
              { label: "Certificate", value: certificate.title },
              { label: "Issued by", value: certificate.issuer },
              {
                label: "Expires on",
                value: certificate.expires_on ? (
                  <FormattedDate
                    date={certificate.expires_on}
                    format="medium"
                  />
                ) : null,
              },
              {
                label: "Supports",
                value:
                  certificate.competencies.length > 0
                    ? certificate.competencies.map((c) => c.name).join(", ")
                    : null,
              },
              {
                label: "Description",
                value: certificate.description,
                prose: true,
              },
            ]}
          />

          {/* The certificate itself, beneath what was recorded about it.
              `Document` chooses how a PDF is shown; an image is as it is. */}
          {passportId &&
            name &&
            certificate.attachments.map((attachment) => (
              <Document
                key={attachment.hash}
                name={attachment.filename}
                type={documentType(attachment)}
                url={certificateAttachmentUrl(
                  passportId,
                  name,
                  attachment.hash,
                )}
              />
            ))}
        </>
      )}
    </Stack>
  );
}
