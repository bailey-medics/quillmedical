/**
 * New User Page
 *
 * Multi-step form for creating a new user with:
 * - Step 1: Basic details (name, email, username, base profession)
 * - Step 2: Competency editor (add/remove competencies)
 * - Step 3: System permissions + review
 * - Step 4: Confirmation
 *
 * @module NewUserPage
 */

import {
  Box,
  Button,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Alert,
  Badge,
  Divider,
  Paper,
} from "@mantine/core";
import { useState } from "react";
import { useNavigate, useBlocker } from "react-router-dom";
import { IconCheck, IconAlertCircle } from "@tabler/icons-react";
import MultiStepForm, {
  type StepConfig,
  type StepContentProps,
} from "@/components/multi-step-form/MultiStepForm";
import DirtyFormNavigation from "@/components/warnings/DirtyFormNavigation";
import PageHeader from "@/components/page-header/PageHeader";
import type {
  BaseProfessionId,
  CompetencyId,
  SystemPermission,
} from "@/types/cbac";
import { getBaseProfessionDetails } from "@/types/cbac";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";
import { api } from "@/lib/api";

/**
 * User form data state
 */
interface UserFormData {
  name: string;
  email: string;
  username: string;
  password: string;
  baseProfession: BaseProfessionId | "";
  additionalCompetencies: CompetencyId[];
  removedCompetencies: CompetencyId[];
  systemPermissions: SystemPermission;
}

/**
 * Step 1: Basic Details
 */
function Step1BasicDetails({
  formData,
  setFormData,
  errors,
}: Omit<StepContentProps, "nextStep" | "prevStep" | "onCancel"> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  errors: Record<string, string>;
}) {
  const professionOptions = baseProfessionsData.base_professions.map((p) => ({
    value: p.id,
    label: p.display_name,
  }));

  return (
    <Stack gap="md">
      <Title order={3}>Basic details</Title>
      <Text size="sm" c="dimmed">
        Enter the user's basic information and select their base profession.
      </Text>

      <TextInput
        label="Full name"
        placeholder="Dr Jane Smith"
        required
        value={formData.name}
        onChange={(e) =>
          setFormData({ ...formData, name: e.currentTarget.value })
        }
        error={errors.name}
      />

      <TextInput
        label="Email"
        placeholder="jane.smith@example.com"
        required
        type="email"
        value={formData.email}
        onChange={(e) =>
          setFormData({ ...formData, email: e.currentTarget.value })
        }
        error={errors.email}
      />

      <TextInput
        label="Username"
        placeholder="janesmith"
        required
        value={formData.username}
        onChange={(e) =>
          setFormData({ ...formData, username: e.currentTarget.value })
        }
        error={errors.username}
      />

      <TextInput
        label="Initial password"
        placeholder="Must be at least 8 characters"
        required
        type="password"
        value={formData.password}
        onChange={(e) =>
          setFormData({ ...formData, password: e.currentTarget.value })
        }
        error={errors.password}
      />

      <Select
        label="Base profession"
        placeholder="Select base profession"
        data={professionOptions}
        required
        value={formData.baseProfession}
        onChange={(value) =>
          setFormData({
            ...formData,
            baseProfession: value as BaseProfessionId,
          })
        }
        error={errors.baseProfession}
        searchable
      />
    </Stack>
  );
}

/**
 * Step 2: Competency Editor
 */
function Step2Competencies({
  formData,
  setFormData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
}) {
  const competencyOptions = competenciesData.competencies.map((c) => ({
    value: c.id,
    label: c.display_name,
  }));

  // Get base profession competencies
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;
  const baseCompetencyIds = profession?.base_competencies || [];

  return (
    <Stack gap="md">
      <Title order={3}>Competency configuration</Title>
      <Text size="sm" c="dimmed">
        Configure additional or removed competencies for this user.
      </Text>

      {profession && (
        <Alert variant="light" color="blue">
          <Text size="sm" fw={500}>
            Base Profession: {profession.display_name}
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            Default competencies: {baseCompetencyIds.length} included
          </Text>
        </Alert>
      )}

      <MultiSelect
        label="Additional competencies"
        description="Add competencies beyond the base profession"
        placeholder="Select additional competencies"
        data={competencyOptions}
        value={formData.additionalCompetencies}
        onChange={(value) =>
          setFormData({
            ...formData,
            additionalCompetencies: value as CompetencyId[],
          })
        }
        searchable
        clearable
      />

      <MultiSelect
        label="Removed competencies"
        description="Remove competencies from the base profession"
        placeholder="Select competencies to remove"
        data={competencyOptions.filter((c) =>
          baseCompetencyIds.includes(c.value as CompetencyId),
        )}
        value={formData.removedCompetencies}
        onChange={(value) =>
          setFormData({
            ...formData,
            removedCompetencies: value as CompetencyId[],
          })
        }
        searchable
        clearable
      />
    </Stack>
  );
}

/**
 * Step 3: System Permissions + Review
 */
function Step3Permissions({
  formData,
  setFormData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
}) {
  const permissionOptions = [
    { value: "staff", label: "Staff - Basic access" },
    { value: "admin", label: "Admin - User & patient management" },
    { value: "superadmin", label: "Super Admin - Full system access" },
  ];

  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;

  return (
    <Stack gap="md">
      <Title order={3}>System permissions & review</Title>
      <Text size="sm" c="dimmed">
        Set system permissions and review the user details.
      </Text>

      <Select
        label="System permission level"
        data={permissionOptions}
        value={formData.systemPermissions}
        onChange={(value) =>
          setFormData({
            ...formData,
            systemPermissions: value as SystemPermission,
          })
        }
        required
      />

      <Divider label="Review" labelPosition="center" mt="lg" />

      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>Name:</Text>
            <Text>{formData.name}</Text>
          </Group>
          <Group justify="space-between">
            <Text fw={500}>Email:</Text>
            <Text>{formData.email}</Text>
          </Group>
          <Group justify="space-between">
            <Text fw={500}>Username:</Text>
            <Text>{formData.username}</Text>
          </Group>
          <Group justify="space-between">
            <Text fw={500}>Base Profession:</Text>
            <Text>{profession?.display_name || "None"}</Text>
          </Group>
          <Group justify="space-between">
            <Text fw={500}>System Permissions:</Text>
            <Badge>{formData.systemPermissions}</Badge>
          </Group>
          {formData.additionalCompetencies.length > 0 && (
            <Box>
              <Text fw={500} mb={4}>
                Additional Competencies:
              </Text>
              <Group gap="xs">
                {formData.additionalCompetencies.map((id) => (
                  <Badge key={id} variant="light" color="blue">
                    {competenciesData.competencies.find((c) => c.id === id)
                      ?.display_name || id}
                  </Badge>
                ))}
              </Group>
            </Box>
          )}
          {formData.removedCompetencies.length > 0 && (
            <Box>
              <Text fw={500} mb={4}>
                Removed Competencies:
              </Text>
              <Group gap="xs">
                {formData.removedCompetencies.map((id) => (
                  <Badge key={id} variant="light" color="red">
                    {competenciesData.competencies.find((c) => c.id === id)
                      ?.display_name || id}
                  </Badge>
                ))}
              </Group>
            </Box>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

/**
 * Step 4: Confirmation
 */
function Step4Confirmation({
  success,
  onCancel,
}: StepContentProps & {
  success: boolean;
}) {
  return (
    <Stack gap="md" align="center" py="xl">
      {success ? (
        <>
          <IconCheck size={64} color="green" />
          <Title order={2}>User created successfully</Title>
          <Text size="sm" c="dimmed" ta="center">
            The new user has been created and can now log in to the system.
          </Text>
          <Button onClick={onCancel} mt="lg">
            Return to Admin
          </Button>
        </>
      ) : (
        <>
          <IconAlertCircle size={64} color="red" />
          <Title order={2}>Failed to create user</Title>
          <Text size="sm" c="dimmed" ta="center">
            There was an error creating the user. Please try again.
          </Text>
          <Button onClick={onCancel} mt="lg">
            Return to Admin
          </Button>
        </>
      )}
    </Stack>
  );
}

/**
 * New User Page Component
 *
 * Multi-step form for creating new users with competencies and permissions.
 *
 * @returns New user creation page
 */
export default function NewUserPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const [formData, setFormData] = useState<UserFormData>({
    name: "",
    email: "",
    username: "",
    password: "",
    baseProfession: "",
    additionalCompetencies: [],
    removedCompetencies: [],
    systemPermissions: "staff",
  });

  // Block navigation when form is dirty and not yet submitted
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !success && currentLocation.pathname !== nextLocation.pathname,
  );

  // Wrapper to set form data and mark as dirty
  function updateFormData(newData: UserFormData) {
    setFormData(newData);
    setDirty(true);
  }

  function handleCancel() {
    setDirty(false); // Allow navigation
    navigate("/admin");
  }

  function validateStep1(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }
    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    }
    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    if (!formData.baseProfession) {
      newErrors.baseProfession = "Base profession is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (submitting) return;

    setSubmitting(true);
    try {
      await api.post("/users", {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        password: formData.password,
        base_profession: formData.baseProfession,
        additional_competencies: formData.additionalCompetencies,
        removed_competencies: formData.removedCompetencies,
        system_permissions: formData.systemPermissions,
      });

      setSuccess(true);
      setDirty(false); // Clear dirty flag on successful submission
      setActiveStep(3); // Move to confirmation step
    } catch (error) {
      console.error("Failed to create user:", error);
      setSuccess(false);
      setDirty(false); // Clear dirty flag even on error (user can retry from admin)
      setActiveStep(3); // Move to confirmation step even on error
    } finally {
      setSubmitting(false);
    }
  }

  const steps: StepConfig[] = [
    {
      label: "Basic Details",
      description: "Name, email, and base profession",
      content: (props) => (
        <Step1BasicDetails
          {...props}
          formData={formData}
          setFormData={updateFormData}
          errors={errors}
        />
      ),
      validate: validateStep1,
    },
    {
      label: "Competencies",
      description: "Configure competency access",
      content: (props) => (
        <Step2Competencies
          {...props}
          formData={formData}
          setFormData={updateFormData}
        />
      ),
    },
    {
      label: "Permissions",
      description: "System permissions and review",
      content: (props) => (
        <Step3Permissions
          {...props}
          formData={formData}
          setFormData={updateFormData}
        />
      ),
      nextButtonLabel: "Create User",
    },
    {
      label: "Confirmation",
      description: "User created",
      content: (props) => <Step4Confirmation {...props} success={success} />,
    },
  ];

  // Intercept step 2 -> 3 transition to submit form
  function handleStepChange(newStep: number) {
    if (activeStep === 2 && newStep === 3) {
      handleSubmit();
    } else {
      setActiveStep(newStep);
    }
  }

  return (
    <>
      <Box p="xl" maw={900} mx="auto">
        <PageHeader title="Create new user" size="lg" />
        <MultiStepForm
          steps={steps}
          onCancel={handleCancel}
          activeStep={activeStep}
          onStepChange={handleStepChange}
        />
      </Box>

      <DirtyFormNavigation
        blocker={blocker}
        onProceed={() => setDirty(false)}
      />
    </>
  );
}
