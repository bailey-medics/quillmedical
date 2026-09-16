/**
 * CertificateForm Component
 *
 * A course, qualification or award the holder is claiming: ALS, a
 * diploma, a certificate of completion.
 *
 * **Self-declared, like the logbook and CPD.** Nobody countersigns a
 * certificate, so there is no declaration and no assessor here. That is
 * the whole difference between this and a sign-off, and the reason it
 * must not be rendered through the same component as one.
 *
 * **The evidence is attached, not uploaded here.** The form takes an
 * attachment that has already been stored and shows what it is. Uploading
 * is a separate concern with its own failure modes — a network drop
 * halfway through a scan should not lose a half-filled form — so the page
 * owns it and hands the result down.
 *
 * **`expires_on` is recorded and nothing acts on it.** Plenty of
 * certificates lapse and plenty of people practise safely with a lapsed
 * one; what that implies is a judgement for an appraiser, so the date is
 * there to be read rather than to drive a status.
 *
 * @example
 * ```tsx
 * <CertificateForm onSubmit={fileCertificate} attachment={uploaded} />
 * ```
 */

import { useState } from "react";
import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { DateField, TextAreaField, TextField } from "@components/form";
import { BodyTextInline, Heading } from "@/components/typography";
import Icon from "@/components/icons/Icon";
import { IconFileText } from "@/components/icons/appIcons";
import ButtonPair from "@/components/button/ButtonPair";
import type { AttachmentInput, CertificateInput } from "@lib/passport";

export interface CertificateFormProps {
  /** Called with the completed certificate */
  onSubmit: (data: CertificateInput) => void;
  /** Called when the holder backs out */
  onCancel?: () => void;
  /** Evidence already uploaded, shown so the holder sees what is attached */
  attachment?: AttachmentInput | null;
  /** Disables submission while a request is in flight */
  isSubmitting?: boolean;
}

export default function CertificateForm({
  onSubmit,
  onCancel,
  attachment = null,
  isSubmitting = false,
}: CertificateFormProps) {
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [awardedOn, setAwardedOn] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  // What it was, who gave it and when: the three things that make a
  // certificate mean anything to somebody reading it later. Expiry and
  // the attachment are genuinely optional — a lapsed certificate is
  // still a record, and not every course issues a document.
  const canSubmit =
    title.trim().length > 0 &&
    issuer.trim().length > 0 &&
    awardedOn !== null &&
    !isSubmitting;

  function handleSubmit() {
    if (!canSubmit || awardedOn === null) return;

    onSubmit({
      title: title.trim(),
      issuer: issuer.trim(),
      awarded_on: awardedOn,
      expires_on: expiresOn,
      description: description.trim() || null,
      attachments: attachment ? [attachment] : [],
    });
  }

  return (
    <BaseCard data-testid="certificate-form">
      <Stack gap="md">
        <Heading>Record a certificate</Heading>

        <TextField
          label="What is it?"
          description="The course, qualification or award, as it is named on the certificate."
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          required
        />

        <TextField
          label="Who issued it?"
          description="The college, deanery, trust or provider."
          value={issuer}
          onChange={(event) => setIssuer(event.currentTarget.value)}
          required
        />

        <DateField
          label="Awarded on"
          value={awardedOn}
          onChange={setAwardedOn}
          maxDate={new Date()}
          required
        />

        <DateField
          label="Expires on"
          description="Optional. Recorded and nothing acts on it — what a lapsed certificate implies is a judgement for an appraiser."
          value={expiresOn}
          onChange={setExpiresOn}
        />

        <TextAreaField
          label="Description"
          description="Optional. Write about the course, not about a patient."
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          autosize
          minRows={2}
        />

        {attachment && (
          <Group gap="xs" wrap="nowrap">
            <Icon icon={<IconFileText />} />
            <BodyTextInline>{attachment.filename}</BodyTextInline>
          </Group>
        )}

        <ButtonPair
          acceptLabel="Record certificate"
          acceptDisabled={!canSubmit}
          acceptLoading={isSubmitting}
          onAccept={handleSubmit}
          onCancel={onCancel}
        />
      </Stack>
    </BaseCard>
  );
}
