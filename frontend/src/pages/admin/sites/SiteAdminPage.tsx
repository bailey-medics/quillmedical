/**
 * Site Admin Page
 *
 * Administrative view for a single site's details.
 * Shows site information, clinical lead, staff, and linked organisations.
 * Only accessible to admin/superadmin.
 */

import { useCallback, useEffect, useState } from "react";
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
import AddButton from "@/components/button/AddButton";
import IconButton from "@/components/button/IconButton";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import DataTable, { type Column } from "@/components/tables/DataTable";
import { ConfirmModal } from "@/components/confirm-modal";
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
  created_at: string;
  updated_at: string;
  staff: SiteStaff[];
  organisations: SiteOrganisation[];
}

export default function SiteAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    await api.del(`/sites/${id}/staff/${removingStaff.id}`);
    await fetchSite();
  }

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

  const formatRole = (role: string): string => {
    return role
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

            <DataTable<SiteStaff>
              data={site.staff}
              columns={staffColumns}
              getRowKey={(member) => member.id}
              pageSize={10}
              fullControls
              emptyMessage="No staff assigned"
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
