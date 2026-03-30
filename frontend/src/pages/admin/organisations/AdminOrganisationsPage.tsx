/**
 * Admin Organisations Page
 *
 * Displays all registered organisations in a table format.
 * Allows administrators to view organisation details and navigate to organisation admin pages.
 * Includes an "Add organisation" button to create new organisations.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Stack, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import DataTable, { type Column } from "@/components/tables/DataTable";
import FormattedDate from "@/components/data/Date";
import { api } from "@/lib/api";

interface Organization {
  id: number;
  name: string;
  type: string;
  location: string | null;
  created_at: string;
  updated_at: string;
}

interface OrganizationsApiResponse {
  organizations: Organization[];
}

/**
 * Admin Organisations Page
 *
 * Main organisation management interface showing all organisation records.
 * Clicking on an organisation navigates to its admin page.
 *
 * @returns Admin organisations page component
 */
export default function AdminOrganisationsPage() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const data = await api.get<OrganizationsApiResponse>("/organizations");
        setOrganizations(data.organizations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchOrganizations();
  }, []);

  const formatType = (type: string): string => {
    // Convert snake_case to Title Case
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const columns: Column<Organization>[] = [
    {
      header: "Name",
      render: (org) => org.name,
    },
    {
      header: "Type",
      render: (org) => formatType(org.type),
    },
    {
      header: "Location",
      render: (org) => org.location || "N/A",
    },
    {
      header: "Created",
      render: (org) => <FormattedDate date={org.created_at} locale="en-GB" />,
    },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Organisations" />
          <AddButton
            label="Add organisation"
            onClick={() => navigate("/admin/organisations/new")}
          />
        </Group>

        <DataTable
          data={organizations}
          columns={columns}
          onRowClick={(org) => navigate(`/admin/organisations/${org.id}`)}
          getRowKey={(org) => org.id}
          loading={loading}
          error={error}
          emptyMessage="No organisations found"
        />
      </Stack>
    </Container>
  );
}
