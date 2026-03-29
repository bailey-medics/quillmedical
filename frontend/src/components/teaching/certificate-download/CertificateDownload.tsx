/**
 * CertificateDownload Component
 *
 * Download button for PDF certificate. Only shown when the candidate
 * has passed and certificate_download is enabled in the config.
 */

import { useState } from "react";
import { Stack } from "@mantine/core";
import IconTextButton from "@/components/button/IconTextButton";
import { PageHeader, BodyText } from "@/components/typography";

interface CertificateDownloadProps {
  /** Assessment ID for the certificate */
  assessmentId: number;
}

export function CertificateDownload({
  assessmentId,
}: CertificateDownloadProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/teaching/assessments/${assessmentId}/certificate`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${assessmentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download certificate:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Download certificate" />
      <BodyText>
        You have passed this assessment. Download your certificate below as a
        PDF to keep for your records.
      </BodyText>
      <IconTextButton
        icon="download"
        label="Download certificate"
        loading={loading}
        onClick={handleDownload}
      />
    </Stack>
  );
}
