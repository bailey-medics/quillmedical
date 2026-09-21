/**
 * Admin Sites Page
 *
 * Every site inside an organisation, in one list. There was no such page:
 * a site could only be reached by first opening the organisation it sits
 * in, so anybody who knew the site but not its owner had nowhere to
 * start.
 *
 * One request fetches every org_unit the person may administer, and the
 * organisations among them are used to name each site's owner. Asking
 * twice — once for the sites, once for the organisations — would cost a
 * round trip to say the same thing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Stack, Group } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { orgUnits, type OrgUnit } from "@/domains/orgUnit";

export default function AdminSitesPage() {
  const navigate = useNavigate();
  const [places, setPlaces] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlaces() {
      try {
        setPlaces(await orgUnits.list());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchPlaces();
  }, []);

  // The organisations are here to name owners, not to be listed
  // themselves — they have their own page.
  const sites = useMemo(
    () => places.filter((place) => !place.is_root),
    [places],
  );

  const namesById = useMemo(() => {
    const names = new Map<number, string>();
    for (const place of places) {
      names.set(place.id, place.name);
    }
    return names;
  }, [places]);

  // A site whose owner is not in the list is one the person may
  // administer without administering the organisation above it, which is
  // allowed. Better to show the site with an unnamed owner than to hide
  // it.
  const ownerOf = useCallback(
    (place: OrgUnit): string =>
      place.parent_id === null ? "" : (namesById.get(place.parent_id) ?? ""),
    [namesById],
  );

  const searchFields = useCallback(
    (place: OrgUnit) => [
      place.name,
      place.type_display_name,
      place.location,
      ownerOf(place),
    ],
    [ownerOf],
  );

  const filterOptions = useMemo(() => {
    const types = [...new Set(sites.map((place) => place.type))].sort();
    const labels = new Map(
      sites.map((place) => [place.type, place.type_display_name]),
    );
    return [
      {
        group: "Type",
        items: types.map((type) => ({
          value: `type:${type}`,
          label: labels.get(type) ?? type,
        })),
      },
    ];
  }, [sites]);

  const filterPredicate = useCallback((filters: string[]) => {
    const typeFilters = filters
      .filter((filter) => filter.startsWith("type:"))
      .map((filter) => filter.slice(5));

    return (place: OrgUnit) =>
      typeFilters.length === 0 || typeFilters.includes(place.type);
  }, []);

  const columns: Column<OrgUnit>[] = [
    {
      header: "Name",
      render: (place) => place.name,
      accessor: (place) => place.name,
    },
    {
      header: "Type",
      render: (place) => place.type_display_name,
      accessor: (place) => place.type_display_name,
    },
    {
      header: "Inside",
      render: (place) => ownerOf(place) || "Not known",
      accessor: (place) => ownerOf(place),
    },
    {
      header: "Location",
      render: (place) => place.location || "N/A",
      accessor: (place) => place.location,
    },
  ];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <PageHeader title="Sites" />
        <AddButton
          label="Add site"
          onClick={() => navigate("/admin/sites/new")}
        />
      </Group>

      <DataTableControlled
        data={sites}
        columns={columns}
        onRowClick={(place) => navigate(`/admin/sites/${place.id}`)}
        getRowKey={(place) => place.id}
        loading={loading}
        error={error}
        emptyMessage="No sites found"
        searchFields={searchFields}
        filterData={filterOptions}
        filterLabel="Filter sites"
        filterAriaLabel="Filter sites"
        filterPredicate={filterPredicate}
      />
    </Stack>
  );
}
