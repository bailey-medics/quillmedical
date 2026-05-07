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

/* eslint-disable no-restricted-syntax */
// Multi-step form uses Box with maw instead of Container for custom max-width

import {
  Box,
  Button,
  Group,
  Stack,
  Alert,
  Loader,
  Center,
} from "@mantine/core";
import { useState, useEffect } from "react";
import { useNavigate, useBlocker, useParams } from "react-router-dom";
import { IconCheck, IconAlertCircle } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import TextField from "@/components/form/TextField";
import SelectField from "@/components/form/SelectField";
import MultiSelectField from "@/components/form/MultiSelectField";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import PermissionBadge from "@/components/badge/PermissionBadge";
import CompetencyBadge from "@/components/badge/CompetencyBadge";
import { StateMessage } from "@/components/message-cards";
import MultiStepForm, {
  type StepConfig,
  type StepContentProps,
} from "@/components/multi-step-form";
import DirtyFormNavigation from "@/components/warnings";
import PageHeader from "@/components/page-header";
import type {
  BaseProfessionId,
  CompetencyId,
  SystemPermission,
  Competency,
  BaseProfession,
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
  isEditMode = false,
}: Omit<StepContentProps, "nextStep" | "prevStep" | "onCancel"> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  errors: Record<string, string>;
  isEditMode?: boolean;
}) {
  const professionOptions = baseProfessionsData.base_professions.map(
    (p: BaseProfession) => ({
      value: p.id,
      label: p.display_name,
    }),
  );

  return (
    <Stack gap="md">
      <Heading>Basic details</Heading>
      <BodyText>
        Enter the user's basic information and select their base profession.
      </BodyText>

      <TextField
        label="Full name"
        placeholder="Dr Jane Smith"
        required
        value={formData.name}
        onChange={(e) =>
          setFormData({ ...formData, name: e.currentTarget.value })
        }
        error={errors.name}
      />

      <TextField
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

      <TextField
        label="Username"
        placeholder="janesmith"
        required
        value={formData.username}
        onChange={(e) =>
          setFormData({ ...formData, username: e.currentTarget.value })
        }
        error={errors.username}
      />

      <TextField
        label={isEditMode ? "New password (optional)" : "Initial password"}
        placeholder={
          isEditMode
            ? "Leave blank to keep current password"
            : "Must be at least 8 characters"
        }
        required={!isEditMode}
        type="password"
        value={formData.password}
        onChange={(e) =>
          setFormData({ ...formData, password: e.currentTarget.value })
        }
        error={errors.password}
        description={
          isEditMode
            ? "Only enter a new password if you want to change it"
            : undefined
        }
      />

      <SelectField
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
  const competencyOptions = competenciesData.competencies.map(
    (c: Competency) => ({
      value: c.id,
      label: c.display_name,
    }),
  );

  // Get base profession competencies
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;
  const baseCompetencyIds = profession?.base_competencies || [];

  return (
    <Stack gap="md">
      <Heading>Competency configuration</Heading>
      <BodyText>
        Configure additional or removed competencies for this user.
      </BodyText>

      {profession && (
        <Alert variant="light" color="primary">
          <BodyTextBold>
            Base profession: {profession.display_name}
          </BodyTextBold>
          <BodyText>
            Default competencies: {baseCompetencyIds.length} included
          </BodyText>
        </Alert>
      )}

      <MultiSelectField
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
      />

      <MultiSelectField
        label="Removed competencies"
        description="Remove competencies from the base profession"
        placeholder="Select competencies to remove"
        data={competencyOptions.filter((c: { value: string; label: string }) =>
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
      />
    </Stack>
  );
}

/**
 * Step 3: System Permissions
 */
function Step3Permissions({
  formData,
  setFormData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
}) {
  const permissionOptions = [
    { value: "patient", label: "Patient - No staff access" },
    { value: "staff", label: "Staff - Basic access" },
    { value: "admin", label: "Admin - User & patient management" },
    { value: "superadmin", label: "Super Admin - Full system access" },
  ];

  return (
    <Stack gap="md">
      <Heading>System permissions</Heading>
      <BodyText>Set the system permission level for this user.</BodyText>

      <SelectField
        label="System permission level"
        data={permissionOptions}
        value={formData.systemPermissions}
        onChange={(value) => {
          if (value) {
            setFormData({
              ...formData,
              systemPermissions: value as SystemPermission,
            });
          }
        }}
        required
      />
    </Stack>
  );
}

/**
 * Step 4: Review
 */
function Step4Review({
  formData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
}) {
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;

  return (
    <Stack gap="md">
      <Heading>Review</Heading>
      <BodyText>Review the user details before submitting.</BodyText>

      <BaseCard>
        <Stack gap="sm">
          <Group justify="space-between">
            <BodyTextBold>Name:</BodyTextBold>
            <BodyTextInline>{formData.name}</BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>Email:</BodyTextBold>
            <BodyTextInline>{formData.email}</BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>Username:</BodyTextBold>
            <BodyTextInline>{formData.username}</BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>Base profession:</BodyTextBold>
            <BodyTextInline>
              {profession?.display_name || "None"}
            </BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>System permissions:</BodyTextBold>
            <PermissionBadge
              permission={
                formData.systemPermissions as "admin" | "superadmin" | "staff"
              }
            />
          </Group>
          {formData.additionalCompetencies.length > 0 && (
            <Box>
              <BodyTextBold>Additional competencies:</BodyTextBold>
              <Group gap="xs">
                {formData.additionalCompetencies.map((id) => (
                  <CompetencyBadge
                    key={id}
                    label={
                      competenciesData.competencies.find(
                        (c: Competency) => c.id === id,
                      )?.display_name || id
                    }
                  />
                ))}
              </Group>
            </Box>
          )}
          {formData.removedCompetencies.length > 0 && (
            <Box>
              <BodyTextBold>Removed competencies:</BodyTextBold>
              <Group gap="xs">
                {formData.removedCompetencies.map((id) => (
                  <CompetencyBadge
                    key={id}
                    label={
                      competenciesData.competencies.find(
                        (c: Competency) => c.id === id,
                      )?.display_name || id
                    }
                    removed
                  />
                ))}
              </Group>
            </Box>
          )}
        </Stack>
      </BaseCard>
    </Stack>
  );
}

/**
 * Step 5: Confirmation
 */
function Step5Confirmation({
  success,
  isEditMode = false,
}: Pick<StepContentProps, never> & {
  success: boolean;
  isEditMode?: boolean;
}) {
  return success ? (
    <StateMessage
      icon={<IconCheck />}
      title={
        isEditMode ? "User updated successfully" : "User created successfully"
      }
      description={
        isEditMode
          ? "The user's details have been updated."
          : "The new user has been created and can now log in to the system."
      }
      colour="success"
    />
  ) : (
    <StateMessage
      icon={<IconAlertCircle />}
      title={isEditMode ? "Failed to update user" : "Failed to create user"}
      description={
        isEditMode
          ? "There was an error updating the user. Please try again."
          : "There was an error creating the user. Please try again."
      }
      colour="alert"
    />
  );
}

/**
 * New User Page Component
 *
 * Multi-step form for creating or editing users with competencies and permissions.
 * Supports two modes:
 * - Create mode: /admin/users/new - Creates a new user
 * - Edit mode: /admin/users/:id/edit - Edits an existing user
 *
 * @returns New/edit user page
 */
export default function NewUserPage() {
  const navigate = useNavigate();
  const { id: userId } = useParams<{ id: string }>();
  const isEditMode = Boolean(userId);

  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Fetch user data in edit mode
  useEffect(() => {
    if (!isEditMode || !userId) return;

    async function fetchUser() {
      try {
        setLoading(true);
        // TODO: Backend needs to implement GET /api/users/:id endpoint
        const response = await fetch(`/api/users/${userId}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch user data");
        }

        const data = await response.json();

        // Pre-fill form with user data
        setFormData({
          name: data.name || "",
          email: data.email || "",
          username: data.username || "",
          password: "", // Don't pre-fill password for security
          baseProfession: data.base_profession || "",
          additionalCompetencies: data.additional_competencies || [],
          removedCompetencies: data.removed_competencies || [],
          systemPermissions: data.system_permissions || "staff",
        });
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setLoadError(
          error instanceof Error ? error.message : "Failed to load user data",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, [isEditMode, userId]);

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

    // Password validation
    if (isEditMode) {
      // In edit mode, password is optional (only validate if provided)
      if (formData.password && formData.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      }
    } else {
      // In create mode, password is required
      if (!formData.password.trim()) {
        newErrors.password = "Password is required";
      } else if (formData.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      }
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
      const payload: {
        name: string;
        email: string;
        username: string;
        base_profession: BaseProfessionId | "";
        additional_competencies: CompetencyId[];
        removed_competencies: CompetencyId[];
        system_permissions: SystemPermission;
        password?: string;
      } = {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        base_profession: formData.baseProfession,
        additional_competencies: formData.additionalCompetencies,
        removed_competencies: formData.removedCompetencies,
        system_permissions: formData.systemPermissions,
      };

      // Only include password if provided (required for create, optional for edit)
      if (formData.password) {
        payload.password = formData.password;
      }

      if (isEditMode && userId) {
        // Edit mode: PATCH existing user
        await api.patch(`/users/${userId}`, payload);
      } else {
        // Create mode: POST new user
        await api.post("/users", payload);
      }

      setSuccess(true);
      setDirty(false); // Clear dirty flag on successful submission
      setActiveStep(4); // Move to confirmation step
    } catch (error) {
      console.error(
        `Failed to ${isEditMode ? "update" : "create"} user:`,
        error,
      );
      setSuccess(false);
      setDirty(false); // Clear dirty flag even on error (user can retry from admin)
      setActiveStep(4); // Move to confirmation step even on error
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
          isEditMode={isEditMode}
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
      description: "System permission level",
      content: (props) => (
        <Step3Permissions
          {...props}
          formData={formData}
          setFormData={updateFormData}
        />
      ),
    },
    {
      label: "Review",
      description: "Review and submit",
      content: (props) => <Step4Review {...props} formData={formData} />,
      nextButtonLabel: isEditMode ? "Update User" : "Create User",
    },
    {
      label: "Confirmation",
      description: isEditMode ? "User updated" : "User created",
      content: (props) => (
        <Step5Confirmation
          {...props}
          success={success}
          isEditMode={isEditMode}
        />
      ),
      hideCancelButton: true,
      hideCard: true,
      nextButtonLabel: "Finished",
    },
  ];

  // Intercept step 3 -> 4 transition to submit form
  function handleStepChange(newStep: number) {
    if (activeStep === 3 && newStep === 4) {
      handleSubmit();
    } else {
      setActiveStep(newStep);
    }
  }

  return (
    <>
      <Box p="xl" maw={900} mx="auto">
        <PageHeader title={isEditMode ? "Edit user" : "Create new user"} />

        {loading ? (
          <Center py="xl">
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <BodyText>Loading user data...</BodyText>
            </Stack>
          </Center>
        ) : loadError ? (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="sm" />}
            title="Error loading user"
            color="var(--alert-color)"
            mt="md"
          >
            {loadError}
            <Button onClick={() => navigate("/admin")} variant="light" mt="md">
              Return to Admin
            </Button>
          </Alert>
        ) : (
          <MultiStepForm
            steps={steps}
            onCancel={handleCancel}
            activeStep={activeStep}
            onStepChange={handleStepChange}
            allStepsAccessible={isEditMode}
          />
        )}
      </Box>

      <DirtyFormNavigation
        blocker={blocker}
        onProceed={() => setDirty(false)}
      />
    </>
  );
}
