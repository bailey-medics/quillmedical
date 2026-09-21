/**
 * Site Admin Page
 *
 * Administrative view for a single site's details.
 * Shows site information, clinical lead, staff, and linked organisations.
 * Only accessible to admin/superadmin.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stack, Group, Skeleton } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { PractisingCompetenciesCard } from "@/components/practising-competencies";
import { BodyTextInline, BodyTextBold, Heading } from "@/components/typography";
import { IconPencil, IconUserMinus } from "@components/icons/appIcons";
import PageHeader from "@/components/page-header";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import AddButton from "@/components/button/AddButton";
import IconButton from "@/components/button/IconButton";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { ConfirmModal } from "@/components/confirm-modal";
import { usePageMessage } from "@/components/page-message";
import {
  orgUnits,
  type OrgUnitDetail,
  type OrgUnitMember,
} from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";

export default function SiteAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showMessage } = usePageMessage();
  const [site, setSite] = useState<OrgUnitDetail | null>(null);
  // Without an id there is nothing to fetch, so the page does not begin in a
  // loading state and the effect below has nothing to do.
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [removingStaff, setRemovingStaff] = useState<OrgUnitMember | null>(
    null,
  );

  const fetchSite = useCallback(async () => {
    if (!id) return;

    try {
      setSite(await orgUnits.get(Number(id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Deferred rather than called straight, so no state is set while the
    // effect body runs. The genuine synchronous path was the missing-id case
    // above, which now returns early and is derived at render instead; the
    // lint rule analyses one function at a time and cannot see that
    // `fetchSite` awaits before touching state, so the wrapper makes the
    // deferral explicit — and makes the floating promise explicit with it.
    void (async () => {
      await fetchSite();
    })();
  }, [fetchSite]);

  async function confirmRemoveStaff() {
    if (!id || !removingStaff) return;
    try {
      await orgUnits.removeMember(Number(id), removingStaff.id);
      showMessage({
        variant: "success",
        title: "Staff member removed",
        description: `${removingStaff.username} has been removed from this site`,
      });
      await fetchSite();
    } catch (err) {
      showMessage({
        variant: "error",
        title: "Failed to remove staff member",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
      });
    }
  }

  // Resolved from the post rather than from a role on a staff row.
  const clinicalLead = site?.members.find(
    (member) => member.id === site?.clinical_lead_id,
  );

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={200} />
        <Skeleton height={150} />
      </Stack>
    );
  }

  if (error || !site) {
    return (
      <ErrorState
        title="Error loading site"
        message={error ?? (id ? "Site not found" : "No site ID provided")}
      />
    );
  }

  const formatType = (type: string): string => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const staffColumns: Column<OrgUnitMember>[] = [
    {
      header: "Full name",
      render: (member) => member.full_name || member.username,
      accessor: (member) => member.full_name || member.username,
    },
    {
      header: "Username",
      render: (member) => member.username,
      accessor: (member) => member.username,
    },
    {
      header: "Email",
      render: (member) => member.email,
      accessor: (member) => member.email,
    },
    {
      header: "",
      width: "50px",
      render: (member) => (
        <EllipsisMenu
          aria-label={`Actions for ${member.username}`}
          items={[
            {
              label: "Remove from site",
              icon: <IconUserMinus />,
              color: "var(--alert-color)",
              onClick: () => setRemovingStaff(member),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={site.name} />

      {/* Site Information */}
      <BaseCard>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Heading>Site information</Heading>
            <IconButton
              icon={<IconPencil />}
              onClick={() => navigate(`/admin/sites/${id}/edit`)}
              aria-label="Edit site"
            />
          </Group>

          <Group gap="xs">
            <BodyTextBold>Status:</BodyTextBold>
            <ActiveStatusBadge active={site.is_active} />
          </Group>

          <Stack gap="xs">
            <Group gap="xs">
              <BodyTextBold>Organisation(s):</BodyTextBold>
              <BodyTextInline>
                {site.parent_name ? site.parent_name : "None"}
              </BodyTextInline>
            </Group>

            <Group gap="xs">
              <BodyTextBold>Name:</BodyTextBold>
              <BodyTextInline>{site.name}</BodyTextInline>
            </Group>

            <Group gap="xs">
              <BodyTextBold>Type:</BodyTextBold>
              <BodyTextInline>{formatType(site.type)}</BodyTextInline>
            </Group>

            <Group gap="xs">
              <BodyTextBold>Location:</BodyTextBold>
              <BodyTextInline>
                {site.location || "Not specified"}
              </BodyTextInline>
            </Group>

            <Group gap="xs">
              <BodyTextBold>Clinical lead:</BodyTextBold>
              <BodyTextInline>
                {clinicalLead?.full_name ||
                  clinicalLead?.username ||
                  "Not assigned"}
              </BodyTextInline>
            </Group>

            <Group gap="xs">
              <BodyTextBold>Clinical lead email:</BodyTextBold>
              <BodyTextInline>{clinicalLead?.email || "N/A"}</BodyTextInline>
            </Group>
          </Stack>
        </Stack>
      </BaseCard>

      {/* Staff Members */}
      <BaseCard>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Heading>Site specific staff members</Heading>
            <AddButton
              label="Add staff"
              onClick={() => navigate(`/admin/sites/${id}/add-staff`)}
            />
          </Group>

          <DataTableControlled<OrgUnitMember>
            data={site.members}
            columns={staffColumns}
            getRowKey={(member) => member.id}
            pageSize={10}
            emptyMessage="No staff assigned"
            searchFields={(m) => [m.full_name, m.username, m.email]}
          />
        </Stack>
      </BaseCard>

      {/* Who may practise here */}
      <PractisingCompetenciesCard
        orgUnitId={Number(id)}
        members={site.members}
        onChanged={(title) => {
          showMessage({ variant: "success", title });
          void fetchSite();
        }}
        onError={(title) => showMessage({ variant: "error", title })}
      />

      <ConfirmModal
        opened={removingStaff !== null}
        onClose={() => setRemovingStaff(null)}
        onAccept={confirmRemoveStaff}
        title="Remove staff member"
        acceptLabel="Remove"
        submittingLabel="Removing…"
      >
        Are you sure you want to remove{" "}
        <strong>{removingStaff?.username}</strong> from this site?
      </ConfirmModal>
    </Stack>
  );
}
