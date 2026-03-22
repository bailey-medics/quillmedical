/**
 * CertificateDownload Component
 *
 * Download button for PDF certificate. Only shown when the candidate
 * has passed and certificate_download is enabled in the config.
 */

import { Button } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import Icon from "@/components/icons";
import { api } from "@/lib/api";
import { useState } from "react";

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
      const blob = await api.get<Blob>(
        `/teaching/assessments/${assessmentId}/certificate`,
        { responseType: "blob" } as never,
      );
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
    <Button
      variant="light"
      leftSection={<Icon icon={<IconDownload />} size="sm" />}
      loading={loading}
      onClick={handleDownload}
    >
      Download certificate
    </Button>
  );
}
