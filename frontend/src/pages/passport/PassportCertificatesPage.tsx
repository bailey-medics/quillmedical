/**
 * Passport Certificates Page
 *
 * The courses, qualifications and awards the holder is claiming, and the
 * form for recording another.
 *
 * **Self-declared.** Nobody countersigns a certificate, which is the
 * whole difference between one and a sign-off. The page never implies
 * otherwise: no assessor appears anywhere on it.
 *
 * **The uploader sits above the form rather than inside it.** Uploading
 * has its own failure modes, and a network drop halfway through a scan
 * must not cost somebody a filled-in form. So the page owns the upload,
 * holds the result, and hands it down — which is also why the attachment
 * survives a failed save and can simply be resubmitted.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import CertificateForm from "@/components/passport/CertificateForm";
import CertificateUploader from "@/components/passport/CertificateUploader";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import { IconFileText } from "@/components/icons/appIcons";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import AddButton from "@/components/button/AddButton";
import {
  addCertificate,
  fetchCertificates,
  fetchMyPassport,
} from "@lib/passport";
import type {
  AttachmentInput,
  Certificate,
  CertificateInput,
} from "@lib/passport";

export function Component() {
  const [passportId, setPassportId] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [recording, setRecording] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        const id = detail.passport.passport_id;
        if (cancelled) return;
        setPassportId(id);
        return fetchCertificates(id);
      })
      .then((result) => {
        if (!cancelled && result) setCertificates(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your certificates could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(data: CertificateInput) {
    if (passportId === null) return;

    setSubmitting(true);
    try {
      await addCertificate(passportId, data);
      setCertificates(await fetchCertificates(passportId));
      setRecording(false);
      // Only once it is safely filed. Clearing on failure would lose an
      // upload the holder would then have to repeat.
      setAttachment(null);
      setError(null);
    } catch {
      setError("That certificate could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Certificates" />

      {error && <ErrorState message={error} />}

      {recording ? (
        <>
          {passportId && (
            <CertificateUploader
              passportId={passportId}
              onUploaded={setAttachment}
            />
          )}

          <CertificateForm
            onSubmit={handleSubmit}
            onCancel={() => setRecording(false)}
            attachment={attachment}
            isSubmitting={submitting}
          />
        </>
      ) : (
        <AddButton
          label="Record a certificate"
          onClick={() => setRecording(true)}
        />
      )}

      {certificates.length === 0 ? (
        <StateMessage
          icon={<IconFileText />}
          title="Nothing recorded yet"
          description="Courses, qualifications and awards you are claiming. Nobody countersigns these."
        />
      ) : (
        certificates.map((certificate) => (
          <BaseCard key={certificate.name}>
            <Stack gap="xs">
              <Heading>{certificate.title}</Heading>
              <BodyTextBold>{certificate.issuer}</BodyTextBold>
              <BodyText>
                <FormattedDate date={certificate.awarded_on} format="medium" />
              </BodyText>
              {certificate.description && (
                <BodyText>{certificate.description}</BodyText>
              )}
            </Stack>
          </BaseCard>
        ))
      )}
    </Stack>
  );
}
