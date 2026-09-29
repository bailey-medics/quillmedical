/**
 * CertificateTable Component
 *
 * The holder's certificates as a table, newest first, laid out as the
 * logbook and CPD tables are so the passport's sections read alike.
 *
 * An expiry date is shown and nothing is computed from it: what a lapsed
 * certificate implies is a judgement for an appraiser.
 *
 * @example
 * ```tsx
 * <CertificateTable certificates={certificates} onSelect={open} />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import DataTable, { type Column } from "@components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { Heading } from "@/components/typography";
import type { Certificate } from "@lib/passport";

const columns: Column<Certificate>[] = [
  {
    header: "Awarded on",
    render: (certificate) => (
      <FormattedDate date={certificate.awarded_on} format="medium" />
    ),
    accessor: (certificate) => certificate.awarded_on,
  },
  {
    header: "Certificate",
    render: (certificate) => certificate.title,
    accessor: (certificate) => certificate.title,
  },
  {
    header: "Issued by",
    render: (certificate) => certificate.issuer,
    accessor: (certificate) => certificate.issuer,
  },
  {
    header: "Expires on",
    render: (certificate) =>
      certificate.expires_on ? (
        <FormattedDate date={certificate.expires_on} format="medium" />
      ) : (
        "–"
      ),
    accessor: (certificate) => certificate.expires_on,
  },
];

export interface CertificateTableProps {
  /** The certificates, in any order */
  certificates: Certificate[];
  /** Called when a certificate is chosen */
  onSelect?: (certificate: Certificate) => void;
  /** Show the table's loading state */
  isLoading?: boolean;
}

export default function CertificateTable({
  certificates,
  onSelect,
  isLoading = false,
}: CertificateTableProps) {
  const sorted = [...certificates].sort((a, b) =>
    b.awarded_on.localeCompare(a.awarded_on),
  );

  return (
    <BaseCard data-testid="certificate-table">
      <Stack gap="md">
        <Heading>Certificates</Heading>
        <DataTable
          data={sorted}
          columns={columns}
          getRowKey={(certificate) => certificate.name}
          onRowClick={onSelect}
          loading={isLoading}
          emptyMessage="No certificates recorded"
        />
      </Stack>
    </BaseCard>
  );
}
