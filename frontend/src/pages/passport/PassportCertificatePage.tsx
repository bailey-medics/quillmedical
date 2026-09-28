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
 * Read from the list of certificates rather than a route of its own, as
 * the logbook and CPD record pages read theirs. What the form does not
 * show, the competencies the certificate supports and its attachments,
 * is sent back unchanged or kept by the server, so correcting a title
 * cannot lose them.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import IconTextButton from "@/components/button/IconTextButton";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import CertificateForm from "@/components/passport/CertificateForm";
import PassportRecordCard from "@/components/passport/PassportRecordCard";
import { IconFileText } from "@/components/icons/appIcons";
import {
  amendCertificate,
  fetchCertificates,
  fetchMyPassport,
} from "@lib/passport";
import type { Certificate, CertificateInput } from "@lib/passport";

export function Component() {
  const { name } = useParams<{ name: string }>();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function handleSave(data: CertificateInput) {
    if (!passportId || !name || !certificate) return;

    setSaving(true);
    try {
      await amendCertificate(passportId, name, {
        ...data,
        // Not on the form, so sent back as they were rather than cleared.
        competencies: certificate.competencies.map((c) => c.id),
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

      {certificate && editing && (
        <CertificateForm
          initial={certificate}
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
              onClick={() => setEditing(true)}
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
              {
                label: "Attached",
                value:
                  certificate.attachments.length > 0
                    ? certificate.attachments.map((a) => a.filename).join(", ")
                    : null,
              },
            ]}
          />
        </>
      )}
    </Stack>
  );
}
