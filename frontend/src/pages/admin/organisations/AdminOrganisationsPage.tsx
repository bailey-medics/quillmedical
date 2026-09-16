/**
 * Admin Organisations Page
 *
 * Displays all registered organisations in a table format.
 * Allows administrators to view organisation details and navigate to organisation admin pages.
 * Includes an "Add organisation" button to create new organisations.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stack, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import AddButton from "@/components/button/AddButton";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import { ConfirmModal } from "@/components/confirm-modal";
import { IconTrash } from "@/components/icons/appIcons";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { orgUnits, type OrgUnit } from "@/domains/orgUnit";
import { useAuth } from "@/auth/AuthContext";

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
  const { state } = useAuth();
  const isSuperadmin = state.user?.platform_role === "superadmin";
  const [organisations, setOrganisations] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganisations() {
      try {
        // The organisations are the places at the top of a tree. Which
        // places those are comes from their type, never from having
        // nothing above them.
        setOrganisations(await orgUnits.list({ roots: true }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchOrganisations();
  }, []);

  // The backend names the type for a person, so the screen no longer
  // has to guess at it from the stored value.
  const typeLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const org of organisations) {
      labels.set(org.type, org.type_display_name);
    }
    return labels;
  }, [organisations]);

  const formatType = useCallback(
    (type: string): string => typeLabels.get(type) ?? type,
    [typeLabels],
  );

  const searchFields = useCallback(
    (org: OrgUnit) => [org.name, org.type_display_name, org.location],
    [],
  );

  const filterOptions = useMemo(() => {
    const types = [...new Set(organisations.map((o) => o.type))].sort();
    return [
      {
        group: "Type",
        items: types.map((t) => ({
          value: `type:${t}`,
          label: typeLabels.get(t) ?? t,
        })),
      },
    ];
  }, [organisations, typeLabels]);

  const filterPredicate = useCallback((filters: string[]) => {
    const typeFilters = filters
      .filter((f) => f.startsWith("type:"))
      .map((f) => f.slice(5));

    return (org: OrgUnit) => {
      if (typeFilters.length > 0 && !typeFilters.includes(org.type)) {
        return false;
      }
      return true;
    };
  }, []);

  const [removingOrg, setRemovingOrg] = useState<OrgUnit | null>(null);
  const { showMessage } = usePageMessage();

  async function confirmRemoveOrg() {
    if (!removingOrg) return;
    try {
      await orgUnits.remove(removingOrg.id);
      setOrganisations((prev) => prev.filter((o) => o.id !== removingOrg.id));
      showMessage({
        variant: "success",
        title: "Organisation removed",
        description: `${removingOrg.name} has been removed`,
      });
    } catch (err) {
      showMessage({
        variant: "error",
        title: "Failed to remove organisation",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setRemovingOrg(null);
    }
  }

  const columns: Column<OrgUnit>[] = [
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
      accessor: (org) => org.location,
    },
    ...(isSuperadmin
      ? [
          {
            header: "",
            width: "50px",
            render: (org: OrgUnit) => (
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
        ]
      : []),
  ];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <PageHeader title="Organisations" />
        {isSuperadmin && (
          <AddButton
            label="Add organisation"
            onClick={() => navigate("/admin/organisations/new")}
          />
        )}
      </Group>

      <DataTableControlled
        data={organisations}
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
  );
}
