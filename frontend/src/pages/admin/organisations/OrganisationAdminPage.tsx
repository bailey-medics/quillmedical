/**
 * Organisation Admin Page
 *
 * Administrative view for a single organisation's details.
 * Shows organisation information, staff members, and patient count.
 * Only accessible to admin/superadmin.
 * Provides action cards for editing and managing organisations.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Stack, Group, Skeleton } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyTextInline,
  BodyTextBold,
  Heading,
  EmptyState,
} from "@/components/typography";
import {
  IconPencil,
  IconTrash,
  IconUserMinus,
} from "@components/icons/appIcons";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";
import IconButton from "@/components/button/IconButton";
import { ConfirmModal } from "@/components/confirm-modal";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import AddButton from "@/components/button/AddButton";
import FeatureBadge from "@/components/badge/FeatureBadge";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

/**
 * Staff member in organisation
 */
interface StaffMember {
  id: number;
  username: string;
  email: string;
  full_name: string;
}

/**
 * Patient member in organisation
 */
interface PatientMember {
  patient_id: string;
}

/**
 * Site linked to organisation
 */
interface SiteMember {
  id: number;
  name: string;
  type: string;
  location: string;
  is_active: boolean;
  clinical_lead: string;
}

/**
 * Organisation details from API
 */
interface OrganizationDetails {
  id: number;
  name: string;
  type: string;
  location: string | null;
  created_at: string;
  updated_at: string;
  staff_count: number;
  patient_count: number;
  staff_members: StaffMember[];
  patient_members: PatientMember[];
  sites: SiteMember[];
}

interface FeatureOut {
  feature_key: string;
  enabled_at: string;
  enabled_by: number | null;
}

/** Labels for known feature keys */
const FEATURE_LABELS: Record<string, string> = {
  teaching: "Teaching",
  messaging: "Messaging",
  letters: "Letters",
};

/**
 * Organisation Admin Page
 *
 * Displays administrative details for a single organisation including:
 * - Basic information (name, type, location)
 * - Staff members list
 * - Patient count
 * - Action cards for editing and managing the organisation
 *
 * @returns Organisation admin page component
 */
export default function OrganisationAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAuth();
  const clinicalServicesEnabled =
    state.status === "authenticated"
      ? state.user.clinical_services_enabled !== false
      : true;
  const [org, setOrg] = useState<OrganizationDetails | null>(null);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<StaffMember | null>(
    null,
  );
  const [removingSite, setRemovingSite] = useState<SiteMember | null>(null);
  const { showMessage } = usePageMessage();

  const fetchOrganizationData = useCallback(async () => {
    if (!id) {
      setError("No organisation ID provided");
      setLoading(false);
      return;
    }

    try {
      const [orgData, featuresData] = await Promise.all([
        api.get<OrganizationDetails>(`/organizations/${id}`),
        api.get<{ features: FeatureOut[] }>(`/organizations/${id}/features`),
      ]);
      setOrg(orgData);
      setEnabledFeatures(featuresData.features.map((f) => f.feature_key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrganizationData();
  }, [fetchOrganizationData]);

  async function confirmRemoveStaff() {
    if (!id || !removingMember) return;
    try {
      await api.del(`/organizations/${id}/staff/${removingMember.id}`);
      showMessage({
        variant: "success",
        title: "Staff member removed",
        description: `${removingMember.username} has been removed from this organisation`,
      });
      await fetchOrganizationData();
    } catch (err) {
      showMessage({
        variant: "error",
        title: "Failed to remove staff member",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
      });
    }
  }

  async function confirmRemoveSite() {
    if (!id || !removingSite) return;
    try {
      await api.del(`/organizations/${id}/sites/${removingSite.id}`);
      showMessage({
        variant: "success",
        title: "Site removed",
        description: `${removingSite.name} has been removed from this organisation`,
      });
      await fetchOrganizationData();
    } catch (err) {
      showMessage({
        variant: "error",
        title: "Failed to remove site",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
      });
    }
  }

  const formatType = (type: string): string => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const siteFilterOptions = useMemo(() => {
    const types = [...new Set((org?.sites ?? []).map((s) => s.type))].sort();
    return [
      {
        group: "Type",
        items: types.map((t) => ({
          value: `type:${t}`,
          label: formatType(t),
        })),
      },
    ];
  }, [org?.sites]);

  const siteFilterPredicate = useCallback((filters: string[]) => {
    const typeFilters = filters
      .filter((f) => f.startsWith("type:"))
      .map((f) => f.slice(5));

    return (site: SiteMember) => {
      if (typeFilters.length > 0 && !typeFilters.includes(site.type)) {
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

  if (error || !org) {
    return <NotFoundLayout />;
  }

  const staffColumns: Column<StaffMember>[] = [
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
              label: "Remove from organisation",
              icon: <IconUserMinus />,
              color: "var(--alert-color)",
              onClick: () => setRemovingMember(member),
            },
          ]}
        />
      ),
    },
  ];

  const patientColumns: Column<PatientMember>[] = [
    { header: "Patient ID", render: (patient) => patient.patient_id },
  ];

  const siteColumns: Column<SiteMember>[] = [
    {
      header: "Name",
      width: "25%",
      render: (site) => site.name,
      accessor: (site) => site.name,
    },
    {
      header: "Type",
      width: "120px",
      render: (site) => formatType(site.type),
      accessor: (site) => site.type,
    },
    {
      header: "Clinical lead",
      width: "160px",
      render: (site) => site.clinical_lead || "\u2014",
      accessor: (site) => site.clinical_lead || "",
    },
    {
      header: "Status",
      width: "110px",
      render: (site) => <ActiveStatusBadge active={site.is_active} />,
      accessor: (site) => (site.is_active ? "active" : "inactive"),
    },
    {
      header: "",
      width: "50px",
      render: (site) => (
        <EllipsisMenu
          aria-label={`Actions for ${site.name}`}
          items={[
            {
              label: "Remove from organisation",
              icon: <IconTrash />,
              color: "var(--alert-color)",
              onClick: () => setRemovingSite(site),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title={org.name} />
        {/* Organisation Information */}
        <BaseCard>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Heading>Organisation information</Heading>
              <IconButton
                icon={<IconPencil />}
                onClick={() => navigate(`/admin/organisations/${id}/edit`)}
                aria-label="Edit organisation"
              />
            </Group>

            <Stack gap="xs">
              <Group gap="xs">
                <BodyTextBold>Name:</BodyTextBold>
                <BodyTextInline>{org.name}</BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>Type:</BodyTextBold>
                <BodyTextInline>{formatType(org.type)}</BodyTextInline>
              </Group>

              <Group gap="xs">
                <BodyTextBold>Location:</BodyTextBold>
                <BodyTextInline>
                  {org.location || "Not specified"}
                </BodyTextInline>
              </Group>
            </Stack>
          </Stack>
        </BaseCard>
        {/* Staff Members */}
        <BaseCard>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Heading>Organisation staff members</Heading>
              <AddButton
                label="Add staff"
                onClick={() => navigate(`/admin/organisations/${id}/add-staff`)}
              />
            </Group>

            <DataTableControlled<StaffMember>
              data={org.staff_members}
              columns={staffColumns}
              onRowClick={(member) => navigate(`/admin/users/${member.id}`)}
              getRowKey={(member) => member.id}
              emptyMessage="No staff members assigned"
              searchFields={(m) => [m.full_name, m.username, m.email]}
            />
          </Stack>
        </BaseCard>
        {/* Patient Members */}
        {clinicalServicesEnabled && (
          <BaseCard>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Heading>Patients</Heading>
                <AddButton
                  label="Add patient"
                  onClick={() =>
                    navigate(`/admin/organisations/${id}/add-patient`)
                  }
                />
              </Group>

              <DataTableControlled<PatientMember>
                data={org.patient_members}
                columns={patientColumns}
                onRowClick={(patient) =>
                  navigate(`/admin/patients/${patient.patient_id}`)
                }
                getRowKey={(patient) => patient.patient_id}
                emptyMessage="No patients assigned"
                searchFields={(p) => [p.patient_id]}
              />
            </Stack>
          </BaseCard>
        )}
        {/* Enabled Features */}
        <BaseCard>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Heading>Enabled features</Heading>
              <IconButton
                icon={<IconPencil />}
                onClick={() => navigate(`/admin/organisations/${id}/features`)}
                aria-label="Edit features"
              />
            </Group>

            {enabledFeatures.length > 0 ? (
              <Group gap="sm">
                {enabledFeatures.map((key) => (
                  <FeatureBadge key={key} label={FEATURE_LABELS[key] ?? key} />
                ))}
              </Group>
            ) : (
              <EmptyState>No features enabled</EmptyState>
            )}
          </Stack>
        </BaseCard>
        {/* Sites */}
        <BaseCard>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Heading>Sites</Heading>
              <AddButton
                label="Add site"
                onClick={() => navigate(`/admin/organisations/${id}/add-site`)}
              />
            </Group>

            <DataTableControlled<SiteMember>
              data={org.sites}
              columns={siteColumns}
              onRowClick={(site) => navigate(`/admin/sites/${site.id}`)}
              getRowKey={(site) => site.id}
              emptyMessage="No sites linked"
              searchFields={(s) => [
                s.name,
                s.type,
                s.location,
                s.clinical_lead,
              ]}
              filterData={siteFilterOptions}
              filterLabel="Filter sites"
              filterAriaLabel="Filter sites"
              filterPredicate={siteFilterPredicate}
            />
          </Stack>
        </BaseCard>
        <ConfirmModal
          opened={removingMember !== null}
          onClose={() => setRemovingMember(null)}
          onAccept={confirmRemoveStaff}
          title="Remove staff member"
          acceptLabel="Remove"
          submittingLabel="Removing…"
        >
          Are you sure you want to remove{" "}
          <strong>{removingMember?.username}</strong> from this organisation?
        </ConfirmModal>
        <ConfirmModal
          opened={removingSite !== null}
          onClose={() => setRemovingSite(null)}
          onAccept={confirmRemoveSite}
          title="Remove site"
          acceptLabel="Remove"
          submittingLabel="Removing\u2026"
        >
          Are you sure you want to remove <strong>{removingSite?.name}</strong>{" "}
          from this organisation?
        </ConfirmModal>{" "}
      </Stack>
    </Container>
  );
}
