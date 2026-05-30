/**
 * Site Admin Page
 *
 * Administrative view for a single site's details.
 * Shows site information, clinical lead, staff, and linked organisations.
 * Only accessible to admin/superadmin.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Stack, Group, Skeleton, Alert } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyTextInline, BodyTextBold, Heading } from "@/components/typography";
import {
  IconAlertCircle,
  IconPencil,
  IconUserMinus,
} from "@components/icons/appIcons";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import AddButton from "@/components/button/AddButton";
import IconButton from "@/components/button/IconButton";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { ConfirmModal } from "@/components/confirm-modal";
import { usePageMessage } from "@/components/page-message";
import { api } from "@/lib/api";

interface SiteStaff {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

interface SiteOrganisation {
  id: number;
  name: string;
}

interface SiteDetails {
  id: number;
  name: string;
  type: string;
  parent_id: number | null;
  location: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  staff: SiteStaff[];
  organisations: SiteOrganisation[];
}

export default function SiteAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showMessage } = usePageMessage();
  const [site, setSite] = useState<SiteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingStaff, setRemovingStaff] = useState<SiteStaff | null>(null);

  const fetchSite = useCallback(async () => {
    if (!id) {
      setError("No site ID provided");
      setLoading(false);
      return;
    }

    try {
      const data = await api.get<SiteDetails>(`/sites/${id}`);
      setSite(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSite();
  }, [fetchSite]);

  async function confirmRemoveStaff() {
    if (!id || !removingStaff) return;
    try {
      await api.del(`/sites/${id}/staff/${removingStaff.id}`);
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

  const formatRole = (role: string): string => {
    return role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const staffFilterOptions = useMemo(() => {
    const roles = [...new Set((site?.staff ?? []).map((s) => s.role))].sort();
    return [
      {
        group: "Role",
        items: roles.map((r) => ({
          value: `role:${r}`,
          label: formatRole(r),
        })),
      },
    ];
  }, [site?.staff]);

  const staffFilterPredicate = useCallback((filters: string[]) => {
    const roleFilters = filters
      .filter((f) => f.startsWith("role:"))
      .map((f) => f.slice(5));

    return (member: SiteStaff) => {
      if (roleFilters.length > 0 && !roleFilters.includes(member.role)) {
        return false;
      }
      return true;
    };
  }, []);

  if (loading) {
    return (
      <Container size="lg">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
          <Skeleton height={150} />
        </Stack>
      </Container>
    );
  }

  if (error || !site) {
    return (
      <Container size="lg">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading site"
          color="var(--alert-color)"
        >
          {error || "Site not found"}
        </Alert>
      </Container>
    );
  }

  const formatType = (type: string): string => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const staffColumns: Column<SiteStaff>[] = [
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
      header: "Role",
      render: (member) => formatRole(member.role),
      accessor: (member) => member.role,
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
    <Container size="lg">
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
                  {site.organisations.length > 0
                    ? site.organisations.map((o) => o.name).join(", ")
                    : "None"}
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
                  {site.staff.find((s) => s.role === "clinical_lead")
                    ?.full_name ||
                    site.staff.find((s) => s.role === "clinical_lead")
                      ?.username ||
                    "Not assigned"}
                </BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>Clinical lead email:</BodyTextBold>
                <BodyTextInline>
                  {site.staff.find((s) => s.role === "clinical_lead")?.email ||
                    "N/A"}
                </BodyTextInline>
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

            <DataTableControlled<SiteStaff>
              data={site.staff}
              columns={staffColumns}
              getRowKey={(member) => member.id}
              pageSize={10}
              emptyMessage="No staff assigned"
              searchFields={(m) => [m.full_name, m.username, m.email, m.role]}
              filterData={staffFilterOptions}
              filterLabel="Filter staff"
              filterAriaLabel="Filter staff"
              filterPredicate={staffFilterPredicate}
            />
          </Stack>
        </BaseCard>

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
    </Container>
  );
}
