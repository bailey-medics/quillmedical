/**
 * Admin Organisations Page
 *
 * Displays all registered organisations in a table format.
 * Allows administrators to view organisation details and navigate to organisation admin pages.
 * Includes an "Add organisation" button to create new organisations.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Stack, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { PageFlash } from "@/components/page-flash";
import { FormStatus } from "@/components/form/Form";
import AddButton from "@/components/button/AddButton";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import { ConfirmModal } from "@/components/confirm-modal";
import { IconTrash } from "@/components/icons/appIcons";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
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

  const searchFields = useCallback(
    (org: Organization) => [org.name, org.type, org.location],
    [],
  );

  const filterOptions = useMemo(() => {
    const types = [...new Set(organizations.map((o) => o.type))].sort();
    return [
      {
        group: "Type",
        items: types.map((t) => ({
          value: `type:${t}`,
          label: formatType(t),
        })),
      },
    ];
  }, [organizations]);

  const filterPredicate = useCallback((filters: string[]) => {
    const typeFilters = filters
      .filter((f) => f.startsWith("type:"))
      .map((f) => f.slice(5));

    return (org: Organization) => {
      if (typeFilters.length > 0 && !typeFilters.includes(org.type)) {
        return false;
      }
      return true;
    };
  }, []);

  const [removingOrg, setRemovingOrg] = useState<Organization | null>(null);
  const [flash, setFlash] = useState<{
    variant: "success" | "error";
    title: string;
    description: string;
  } | null>(null);

  async function confirmRemoveOrg() {
    if (!removingOrg) return;
    try {
      await api.del(`/organizations/${removingOrg.id}`);
      setOrganizations((prev) => prev.filter((o) => o.id !== removingOrg.id));
      setFlash({
        variant: "success",
        title: "Organisation removed",
        description: `${removingOrg.name} has been removed`,
      });
    } catch (err) {
      setFlash({
        variant: "error",
        title: "Failed to remove organisation",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setRemovingOrg(null);
    }
  }

  const columns: Column<Organization>[] = [
    {
      header: "Name",
      render: (org) => org.name,
      accessor: (org) => org.name,
    },
    {
      header: "Type",
      render: (org) => formatType(org.type),
      accessor: (org) => org.type,
    },
    {
      header: "Location",
      render: (org) => org.location || "N/A",
      accessor: (org) => org.location ?? "",
    },
    {
      header: "",
      width: "50px",
      render: (org) => (
        <EllipsisMenu
          aria-label={`Actions for ${org.name}`}
          items={[
            {
              label: "Remove organisation",
              icon: <IconTrash />,
              color: "var(--alert-color)",
              onClick: () => setRemovingOrg(org),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Container size="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-end">
          <PageHeader title="Organisations" />
          <AddButton
            label="Add organisation"
            onClick={() => navigate("/admin/organisations/new")}
          />
        </Group>

        <PageFlash />
        {flash && (
          <FormStatus
            variant={flash.variant}
            title={flash.title}
            description={flash.description}
            onDismiss={() => setFlash(null)}
          />
        )}

        <DataTableControlled
          data={organizations}
          columns={columns}
          onRowClick={(org) => navigate(`/admin/organisations/${org.id}`)}
          getRowKey={(org) => org.id}
          loading={loading}
          error={error}
          emptyMessage="No organisations found"
          searchFields={searchFields}
          filterData={filterOptions}
          filterLabel="Filter organisations"
          filterAriaLabel="Filter organisations"
          filterPredicate={filterPredicate}
        />

        <ConfirmModal
          opened={removingOrg !== null}
          onClose={() => setRemovingOrg(null)}
          onAccept={confirmRemoveOrg}
          title="Remove organisation"
          acceptLabel="Remove"
          submittingLabel="Removing…"
        >
          Are you sure you want to remove <strong>{removingOrg?.name}</strong>?
          This will also remove all staff and patient memberships.
        </ConfirmModal>
      </Stack>
    </Container>
  );
}
