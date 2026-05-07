/**
 * Admin Permissions Page
 *
 * System permissions management interface for super administrators.
 * Provides actions for managing user competencies and system permissions.
 */

import { BodyText } from "@/components/typography";
import SelectField from "@/components/form/SelectField";
import MultiSelectField from "@/components/form/MultiSelectField";
import TextField from "@/components/form/TextField";
import { Container, SimpleGrid, Stack } from "@mantine/core";
import { IconShieldCheck } from "@components/icons/appIcons";
import ActionCard from "@/components/action-card";
import PageHeader from "@/components/page-header";
import { useState, useEffect } from "react";
import { Modal } from "@mantine/core";
import ButtonPair from "@/components/button/ButtonPair";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import type {
  CompetencyId,
  BaseProfessionId,
  SystemPermission,
  Competency,
  BaseProfession,
} from "@/types/cbac";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";

/**
 * API User Response
 */
interface ApiUser {
  id: number;
  username: string;
  email: string;
}

/**
 * User Permissions View Data
 */
interface UserPermissionsData {
  userId: string;
  username: string;
  email: string;
  baseProfession: BaseProfessionId;
  additionalCompetencies: CompetencyId[];
  removedCompetencies: CompetencyId[];
  systemPermissions: SystemPermission;
}

/**
 * Admin Permissions Page
 *
 * Interface for managing system permissions (superadmin only) with options to:
 * - View user competencies
 * - Edit user permissions
 * - Modify base professions
 *
 * @returns Admin permissions page component
 */
export default function AdminPermissionsPage() {
  const { state } = useAuth();
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [users, setUsers] = useState<
    Array<{ id: string; username: string; email: string }>
  >([]);
  const [permissionsForm, setPermissionsForm] = useState<UserPermissionsData>({
    userId: "",
    username: "",
    email: "",
    baseProfession: "" as BaseProfessionId,
    additionalCompetencies: [],
    removedCompetencies: [],
    systemPermissions: "staff",
  });

  const isSuperAdmin =
    state.status === "authenticated" &&
    state.user.system_permissions === "superadmin";

  // Fetch users for the permissions modal
  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      if (!isSuperAdmin) {
        return;
      }

      try {
        const response = await api.get<{ users: ApiUser[] }>("/users");

        if (!cancelled) {
          setUsers(
            response.users.map((u) => ({
              id: String(u.id),
              username: u.username,
              email: u.email,
            })),
          );
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
      }
    }

    if (permissionsModalOpen) {
      fetchUsers();
    }

    return () => {
      cancelled = true;
    };
  }, [permissionsModalOpen, isSuperAdmin]);

  const handleSelectUserForPermissions = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      // In a real app, fetch full user details including competencies
      setPermissionsForm({
        userId: user.id,
        username: user.username,
        email: user.email,
        baseProfession: "" as BaseProfessionId,
        additionalCompetencies: [],
        removedCompetencies: [],
        systemPermissions: "staff",
      });
    }
  };

  const handleUpdatePermissions = () => {
    // TODO: Wire up actual API callback
    setPermissionsModalOpen(false);
  };

  const competencyOptions = competenciesData.competencies.map(
    (c: Competency) => ({
      value: c.id,
      label: c.display_name,
    }),
  );

  const professionOptions = baseProfessionsData.base_professions.map(
    (p: BaseProfession) => ({
      value: p.id,
      label: p.display_name,
    }),
  );

  const systemPermissionOptions = [
    { value: "patient", label: "Patient" },
    { value: "staff", label: "Staff" },
    { value: "admin", label: "Admin" },
    { value: "superadmin", label: "Super Admin" },
  ];

  return (
    <Container size="lg" pt="xl">
      <Stack gap="lg">
        <PageHeader title="Permissions management" />

        {!isSuperAdmin && (
          <BodyText>Only super administrators can access this page.</BodyText>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <ActionCard
            icon={<IconShieldCheck />}
            title="Change system permissions"
            subtitle="View and edit user competencies and system permissions"
            buttonLabel="Change permissions"
            buttonUrl="#"
            onClick={() => isSuperAdmin && setPermissionsModalOpen(true)}
          />
        </SimpleGrid>

        {/* Manage Permissions Modal */}
        <Modal
          opened={permissionsModalOpen}
          onClose={() => setPermissionsModalOpen(false)}
          title="Manage user permissions"
          size="lg"
          transitionProps={{ duration: 0 }}
          withinPortal={false}
        >
          <Stack gap="md">
            <SelectField
              label="Select user"
              placeholder="Choose user to manage"
              data={users.map((u) => ({
                value: u.id,
                label: `${u.username} (${u.email})`,
              }))}
              value={permissionsForm.userId}
              onChange={(val) => {
                if (val) handleSelectUserForPermissions(val);
              }}
              searchable
              required
            />

            {permissionsForm.userId && (
              <>
                <TextField
                  label="Username"
                  value={permissionsForm.username}
                  disabled
                />
                <TextField
                  label="Email"
                  value={permissionsForm.email}
                  disabled
                />
                <SelectField
                  label="Base profession"
                  placeholder="Select profession"
                  data={professionOptions}
                  value={permissionsForm.baseProfession}
                  onChange={(val) =>
                    setPermissionsForm({
                      ...permissionsForm,
                      baseProfession: val as BaseProfessionId,
                    })
                  }
                  searchable
                  disabled={!isSuperAdmin}
                />
                <MultiSelectField
                  label="Additional competencies"
                  placeholder="Select competencies"
                  data={competencyOptions}
                  value={permissionsForm.additionalCompetencies}
                  onChange={(val) =>
                    setPermissionsForm({
                      ...permissionsForm,
                      additionalCompetencies: val as CompetencyId[],
                    })
                  }
                  searchable
                  disabled={!isSuperAdmin}
                />
                <MultiSelectField
                  label="Removed competencies"
                  placeholder="Select competencies to remove"
                  data={competencyOptions}
                  value={permissionsForm.removedCompetencies}
                  onChange={(val) =>
                    setPermissionsForm({
                      ...permissionsForm,
                      removedCompetencies: val as CompetencyId[],
                    })
                  }
                  searchable
                  disabled={!isSuperAdmin}
                />
                <SelectField
                  label="System permissions"
                  placeholder="Select permission level"
                  data={systemPermissionOptions}
                  value={permissionsForm.systemPermissions}
                  onChange={(val) =>
                    setPermissionsForm({
                      ...permissionsForm,
                      systemPermissions: val as SystemPermission,
                    })
                  }
                  disabled={!isSuperAdmin}
                />

                {!isSuperAdmin && (
                  <BodyText>
                    Only super admins can modify user permissions
                  </BodyText>
                )}
              </>
            )}

            <ButtonPair
              acceptLabel="Update permissions"
              acceptDisabled={!isSuperAdmin}
              onAccept={handleUpdatePermissions}
              onCancel={() => setPermissionsModalOpen(false)}
            />
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
