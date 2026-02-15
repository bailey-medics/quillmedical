/**
 * Admin Component Module
 *
 * Administrative interface for managing users, patients, and permissions.
 * Provides sections for:
 * - Adding new users with competencies and permissions
 * - Adding new patient records
 * - Linking users to patient records
 * - Viewing and editing user competencies/permissions
 */

import {
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconUserPlus, IconLink, IconShieldCheck } from "@tabler/icons-react";
import { useState } from "react";
import ActionCard from "@/components/action-card";
import StatCard from "@/components/stats-card";
import type {
  CompetencyId,
  BaseProfessionId,
  SystemPermission,
} from "@/types/cbac";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";

/**
 * User Form Data
 */
interface UserFormData {
  name: string;
  email: string;
  username: string;
  baseProfession: BaseProfessionId | "";
  additionalCompetencies: CompetencyId[];
  systemPermissions: SystemPermission;
}

/**
 * Patient Form Data
 */
interface PatientFormData {
  firstName: string;
  lastName: string;
  dob: string;
  nationalNumber: string;
  localTrustNumber: string;
}

/**
 * User-Patient Link Form Data
 */
interface LinkFormData {
  userId: string;
  patientId: string;
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

interface AdminProps {
  /** Current user's system permissions */
  userPermissions: SystemPermission;
  /** Loading state for statistics */
  loading?: boolean;
  /** Callback when user is added */
  onAddUser?: (user: UserFormData) => void;
  /** Callback when patient is added */
  onAddPatient?: (patient: PatientFormData) => void;
  /** Callback when user-patient link is created */
  onLinkUserPatient?: (link: LinkFormData) => void;
  /** Callback when user permissions are updated */
  onUpdatePermissions?: (permissions: UserPermissionsData) => void;
  /** Existing users for selection */
  existingUsers?: Array<{ id: string; username: string; email: string }>;
  /** Existing patients for selection */
  existingPatients?: Array<{ id: string; name: string }>;
}

export default function Admin({
  userPermissions,
  loading = false,
  onAddUser,
  onAddPatient,
  onLinkUserPatient,
  onUpdatePermissions,
  existingUsers = [],
  existingPatients = [],
}: AdminProps) {
  // Modal states
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [addPatientModalOpen, setAddPatientModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);

  // Form states
  const [userForm, setUserForm] = useState<UserFormData>({
    name: "",
    email: "",
    username: "",
    baseProfession: "",
    additionalCompetencies: [],
    systemPermissions: "staff",
  });

  const [patientForm, setPatientForm] = useState<PatientFormData>({
    firstName: "",
    lastName: "",
    dob: "",
    nationalNumber: "",
    localTrustNumber: "",
  });

  const [linkForm, setLinkForm] = useState<LinkFormData>({
    userId: "",
    patientId: "",
  });

  const [permissionsForm, setPermissionsForm] = useState<UserPermissionsData>({
    userId: "",
    username: "",
    email: "",
    baseProfession: "" as BaseProfessionId,
    additionalCompetencies: [],
    removedCompetencies: [],
    systemPermissions: "staff",
  });

  const isSuperAdmin = userPermissions === "superadmin";

  // Prepare select data
  const competencyOptions = competenciesData.competencies.map((c) => ({
    value: c.id,
    label: c.display_name,
  }));

  const professionOptions = baseProfessionsData.base_professions.map((p) => ({
    value: p.id,
    label: p.display_name,
  }));

  const systemPermissionOptions = [
    { value: "patient", label: "Patient" },
    { value: "staff", label: "Staff" },
    { value: "admin", label: "Admin" },
    { value: "superadmin", label: "Super Admin" },
  ];

  // Handlers
  const handleAddUser = () => {
    if (onAddUser) {
      onAddUser(userForm);
    }
    setAddUserModalOpen(false);
    // Reset form
    setUserForm({
      name: "",
      email: "",
      username: "",
      baseProfession: "",
      additionalCompetencies: [],
      systemPermissions: "staff",
    });
  };

  const handleAddPatient = () => {
    if (onAddPatient) {
      onAddPatient(patientForm);
    }
    setAddPatientModalOpen(false);
    // Reset form
    setPatientForm({
      firstName: "",
      lastName: "",
      dob: "",
      nationalNumber: "",
      localTrustNumber: "",
    });
  };

  const handleLinkUserPatient = () => {
    if (onLinkUserPatient) {
      onLinkUserPatient(linkForm);
    }
    setLinkModalOpen(false);
    // Reset form
    setLinkForm({
      userId: "",
      patientId: "",
    });
  };

  const handleUpdatePermissions = () => {
    if (onUpdatePermissions) {
      onUpdatePermissions(permissionsForm);
    }
    setPermissionsModalOpen(false);
  };

  const handleSelectUserForPermissions = (userId: string) => {
    const user = existingUsers.find((u) => u.id === userId);
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

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <div>
          <Title order={1}>Administration</Title>
          <Text c="dimmed">Manage users, patients, and system permissions</Text>
        </div>
        <Badge
          size="lg"
          variant="filled"
          color={
            userPermissions === "superadmin"
              ? "green"
              : userPermissions === "admin"
                ? "blue"
                : "gray"
          }
        >
          {userPermissions.toUpperCase()}
        </Badge>
      </Group>

      <Group grow>
        <StatCard
          title="Total Users"
          value={existingUsers.length}
          loading={loading}
        />
        <StatCard
          title="Total Patients"
          value={existingPatients.length}
          loading={loading}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <ActionCard
          icon={<IconUserPlus size={24} />}
          title="Add User"
          subtitle="Create a new user account with competencies and permissions"
          buttonLabel="Add New User"
          buttonUrl="#"
          onClick={() => setAddUserModalOpen(true)}
        />
        <ActionCard
          icon={<IconUserPlus size={24} />}
          title="Add Patient"
          subtitle="Register a new patient record with demographics"
          buttonLabel="Add New Patient"
          buttonUrl="#"
          onClick={() => setAddPatientModalOpen(true)}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <ActionCard
          icon={<IconLink size={24} />}
          title="Link User to Patient"
          subtitle="Associate a user account with a patient record"
          buttonLabel="Create Link"
          buttonUrl="#"
          onClick={() => setLinkModalOpen(true)}
        />
        {isSuperAdmin && (
          <ActionCard
            icon={<IconShieldCheck size={24} />}
            title="Change System Permissions"
            subtitle="View and edit user competencies and system permissions"
            buttonLabel="Change Permissions"
            buttonUrl="#"
            onClick={() => setPermissionsModalOpen(true)}
          />
        )}
      </SimpleGrid>

      {/* Add User Modal */}
      <Modal
        opened={addUserModalOpen}
        onClose={() => setAddUserModalOpen(false)}
        title="Add New User"
        size="lg"
        transitionProps={{ duration: 0 }}
        withinPortal={false}
      >
        <Stack gap="md">
          <TextInput
            label="Full Name"
            placeholder="John Doe"
            required
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
          />
          <TextInput
            label="Username"
            placeholder="johndoe"
            required
            value={userForm.username}
            onChange={(e) =>
              setUserForm({ ...userForm, username: e.target.value })
            }
          />
          <TextInput
            label="Email"
            placeholder="john.doe@example.com"
            type="email"
            required
            value={userForm.email}
            onChange={(e) =>
              setUserForm({ ...userForm, email: e.target.value })
            }
          />
          <Select
            label="Base Profession"
            placeholder="Select profession"
            data={professionOptions}
            value={userForm.baseProfession}
            onChange={(val) =>
              setUserForm({
                ...userForm,
                baseProfession: val as BaseProfessionId,
              })
            }
            searchable
          />
          <MultiSelect
            label="Additional Competencies"
            placeholder="Select competencies"
            data={competencyOptions}
            value={userForm.additionalCompetencies}
            onChange={(val) =>
              setUserForm({
                ...userForm,
                additionalCompetencies: val as CompetencyId[],
              })
            }
            searchable
          />
          <Select
            label="System Permissions"
            placeholder="Select permission level"
            data={systemPermissionOptions}
            value={userForm.systemPermissions}
            onChange={(val) =>
              setUserForm({
                ...userForm,
                systemPermissions: val as SystemPermission,
              })
            }
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setAddUserModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUser}>Add User</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Add Patient Modal */}
      <Modal
        opened={addPatientModalOpen}
        onClose={() => setAddPatientModalOpen(false)}
        title="Add New Patient"
        size="lg"
        transitionProps={{ duration: 0 }}
        withinPortal={false}
      >
        <Stack gap="md">
          <TextInput
            label="First Name"
            placeholder="John"
            required
            value={patientForm.firstName}
            onChange={(e) =>
              setPatientForm({ ...patientForm, firstName: e.target.value })
            }
          />
          <TextInput
            label="Last Name"
            placeholder="Doe"
            required
            value={patientForm.lastName}
            onChange={(e) =>
              setPatientForm({ ...patientForm, lastName: e.target.value })
            }
          />
          <TextInput
            label="Date of Birth"
            placeholder="YYYY-MM-DD"
            type="date"
            required
            value={patientForm.dob}
            onChange={(e) =>
              setPatientForm({ ...patientForm, dob: e.target.value })
            }
          />
          <TextInput
            label="National Number"
            placeholder="NHS Number, Medicare Number, etc."
            value={patientForm.nationalNumber}
            onChange={(e) =>
              setPatientForm({
                ...patientForm,
                nationalNumber: e.target.value,
              })
            }
          />
          <TextInput
            label="Local Trust Number"
            placeholder="Hospital/Trust ID"
            value={patientForm.localTrustNumber}
            onChange={(e) =>
              setPatientForm({
                ...patientForm,
                localTrustNumber: e.target.value,
              })
            }
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={() => setAddPatientModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddPatient}>Add Patient</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Link User to Patient Modal */}
      <Modal
        opened={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title="Link User to Patient"
        size="md"
        transitionProps={{ duration: 0 }}
        withinPortal={false}
      >
        <Stack gap="md">
          <Select
            label="Select User"
            placeholder="Choose user"
            data={existingUsers.map((u) => ({
              value: u.id,
              label: `${u.username} (${u.email})`,
            }))}
            value={linkForm.userId}
            onChange={(val) => setLinkForm({ ...linkForm, userId: val || "" })}
            searchable
            required
          />
          <Select
            label="Select Patient"
            placeholder="Choose patient"
            data={existingPatients.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            value={linkForm.patientId}
            onChange={(val) =>
              setLinkForm({ ...linkForm, patientId: val || "" })
            }
            searchable
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setLinkModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkUserPatient}>Create Link</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Manage Permissions Modal */}
      <Modal
        opened={permissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
        title="Manage User Permissions"
        size="lg"
        transitionProps={{ duration: 0 }}
        withinPortal={false}
      >
        <Stack gap="md">
          <Select
            label="Select User"
            placeholder="Choose user to manage"
            data={existingUsers.map((u) => ({
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
              <TextInput
                label="Username"
                value={permissionsForm.username}
                disabled
              />
              <TextInput label="Email" value={permissionsForm.email} disabled />
              <Select
                label="Base Profession"
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
              <MultiSelect
                label="Additional Competencies"
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
              <MultiSelect
                label="Removed Competencies"
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
              <Select
                label="System Permissions"
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
                <Text size="sm" c="dimmed" fs="italic">
                  Only super admins can modify user permissions
                </Text>
              )}
            </>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={() => setPermissionsModalOpen(false)}
            >
              Cancel
            </Button>
            {isSuperAdmin && (
              <Button onClick={handleUpdatePermissions}>
                Update Permissions
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
