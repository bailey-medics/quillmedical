/**
 * User Info Update Page
 *
 * Multi-step form for creating or editing a user with:
 * - Step 1: Basic details (name, email, username, base profession)
 * - Step 2: Organisation/site assignment
 * - Step 3: Competency editor (add/remove competencies)
 * - Step 4: System permissions + review
 * - Step 5: Confirmation
 *
 * @module UserInfoUpdatePage
 */

// Multi-step form uses Box with maw instead of Container for custom max-width

import { Box, Group, Stack, Alert, Loader, Center } from "@mantine/core";
import { useState, useEffect } from "react";
import { useNavigate, useBlocker, useParams } from "react-router-dom";
import { IconCheck, IconAlertCircle } from "@components/icons/appIcons";
import BaseCard from "@/components/base-card/BaseCard";
import TextField from "@/components/form/TextField";
import PasswordField from "@/components/form/PasswordField";
import SelectField from "@/components/form/SelectField";
import MultiSelectField from "@/components/form/MultiSelectField";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import CompetencyBadge from "@/components/badge/CompetencyBadge";
import { StateMessage } from "@/components/message-cards";
import MultiStepForm, {
  type StepConfig,
  type StepContentProps,
} from "@/components/multi-step-form";
import DirtyFormNavigation from "@/components/warnings";
import PageHeader from "@/components/page-header";
import type { BaseProfessionId, CompetencyId, Competency } from "@/types/cbac";
import { getBaseProfessionDetails, ACTIVE_COMPETENCIES } from "@/types/cbac";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import PlatformRoleBadge, {
  type PlatformRole,
} from "@/components/badge/PlatformRoleBadge";
import ErrorState from "@/components/error-state/ErrorState";
import { orgUnits, type OrgUnit } from "@/domains/orgUnit";

/**
 * An organisation and the places inside it, all in place ids.
 *
 * Organisations and the places inside them are rows in one table, so
 * there is one kind of id here. There used to be two, counted against
 * two tables, and the form was the last thing still telling them apart.
 */
interface OrgOption {
  id: number;
  name: string;
  sites: { id: number; name: string }[];
}

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
  platformRole: PlatformRole;
  /**
   * Every place the person belongs to, organisations included.
   *
   * One list, because the backend now takes one. The two controls on
   * screen are a view of it: one offers the organisations, the other the
   * places inside them.
   */
  orgUnitIds: string[];
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
  const isClinical = import.meta.env.VITE_CLINICAL_SERVICES_ENABLED !== "false";

  const professionOptions = baseProfessionsData.base_professions
    .filter((p) => isClinical || !p.requires_clinical_services)
    .map((p) => ({
      value: p.id,
      label: p.display_name,
    }));

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
        autoComplete="off"
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
        autoComplete="off"
        value={formData.username}
        onChange={(e) =>
          setFormData({ ...formData, username: e.currentTarget.value })
        }
        error={errors.username}
      />

      <PasswordField
        label={isEditMode ? "New password (optional)" : "Initial password"}
        placeholder={
          isEditMode
            ? "Leave blank to keep current password"
            : "Must be at least 8 characters"
        }
        required={!isEditMode}
        autoComplete="new-password"
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
        onChange={(value) => {
          setFormData({
            ...formData,
            baseProfession: value as BaseProfessionId,
          });
        }}
        error={errors.baseProfession}
        searchable
      />
    </Stack>
  );
}

/**
 * Step 2: Organisation/Site
 */
function Step2Organisation({
  formData,
  setFormData,
  organisations,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  organisations: OrgOption[];
}) {
  const orgOptions = organisations.map((o) => ({
    value: String(o.id),
    label: o.name,
  }));

  const siteOptions = organisations.flatMap((org) =>
    org.sites.map((s) => ({
      value: String(s.id),
      label: `${org.name} - ${s.name}`,
    })),
  );

  // Two controls over one list. Which control a place belongs in is
  // decided by what it is, not by the person having put it there.
  const validOrgIds = new Set(orgOptions.map((o) => o.value));
  const validSiteIds = new Set(siteOptions.map((s) => s.value));
  const visibleOrgIds = formData.orgUnitIds.filter((id) => validOrgIds.has(id));
  const visibleSiteIds = formData.orgUnitIds.filter((id) =>
    validSiteIds.has(id),
  );

  /** Replace one control's share of the list, leaving the rest alone. */
  function replaceShare(offered: Set<string>, chosen: string[]) {
    setFormData({
      ...formData,
      orgUnitIds: [
        ...formData.orgUnitIds.filter((id) => !offered.has(id)),
        ...chosen,
      ],
    });
  }

  return (
    <Stack gap="md">
      <Heading>Organisation/site</Heading>
      <BodyText>
        Optionally assign this user to an organisation and/or a site.
      </BodyText>

      <MultiSelectField
        label="Organisation"
        description="Only add user here if they require organisation access (this is not needed for 'Teaching delegates')"
        placeholder="Select organisations (optional)"
        data={orgOptions}
        value={visibleOrgIds}
        onChange={(value) => replaceShare(validOrgIds, value)}
        searchable
      />

      <MultiSelectField
        label="Site"
        description="Teaching delegates normally only need site access"
        placeholder="Select sites (optional)"
        data={siteOptions}
        value={visibleSiteIds}
        onChange={(value) => replaceShare(validSiteIds, value)}
        searchable
      />
    </Stack>
  );
}

/**
 * Step 3: Competency Editor
 */
function Step2Competencies({
  formData,
  setFormData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
}) {
  // Current only. The lookups further down still read the whole
  // catalogue, because a competency already granted has to keep
  // rendering its name after it is retired.
  const competencyOptions = ACTIVE_COMPETENCIES.map((c: Competency) => ({
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
            Default competencies ({baseCompetencyIds.length}):
          </BodyText>
          <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
            {baseCompetencyIds.map((id) => {
              const comp = competenciesData.competencies.find(
                (c: Competency) => c.id === id,
              );
              return (
                <li key={id}>
                  <BodyTextInline>{comp?.display_name || id}</BodyTextInline>
                </li>
              );
            })}
          </ul>
        </Alert>
      )}

      <MultiSelectField
        label="Additional competencies"
        description="Add competencies beyond the base profession"
        placeholder="Select additional competencies"
        data={competencyOptions.filter(
          (c: { value: string; label: string }) =>
            !baseCompetencyIds.includes(c.value as CompetencyId),
        )}
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
  const { state } = useAuth();
  const isSuperadmin = state.user?.platform_role === "superadmin";

  // A dropdown rather than a checkbox, though there are only two
  // options. A checkbox reads more naturally for a yes/no, but the
  // dropdown leaves room for further platform roles without redesigning
  // the step.
  //
  // Only an operator is offered the operator option, matching the
  // backend guard on PATCH /users/{id}: the manage_users competency says
  // what someone may administer, never that they may promote someone to
  // run the platform.
  const platformRoleOptions = [
    { value: "standard", label: "Standard - Not a Quill operator" },
    ...(isSuperadmin
      ? [
          {
            value: "superadmin",
            label: "Superadmin - Operates Quill itself",
          },
        ]
      : []),
  ];

  return (
    <Stack gap="md">
      <Heading>Platform role</Heading>
      <BodyText>
        Whether this person operates Quill itself. It grants no clinical access:
        what someone may do with patient records comes from their competencies,
        wherever they work.
      </BodyText>

      <SelectField
        label="Platform role"
        data={platformRoleOptions}
        value={formData.platformRole}
        onChange={(value) => {
          if (value) {
            setFormData({
              ...formData,
              platformRole: value as PlatformRole,
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
  organisations,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  organisations: OrgOption[];
}) {
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;

  const selectedOrgs = organisations.filter((o) =>
    formData.orgUnitIds.includes(String(o.id)),
  );
  const selectedSites = organisations.flatMap((org) =>
    org.sites
      .filter((s) => formData.orgUnitIds.includes(String(s.id)))
      .map((s) => `${org.name} - ${s.name}`),
  );

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
          {/*
            The badge marks operators and renders nothing otherwise, so
            the plain text carries the standard case — a label pointing
            at an empty space reads as a fault rather than as an answer.
          */}
          <Group justify="space-between">
            <BodyTextBold>Platform role:</BodyTextBold>
            {formData.platformRole === "superadmin" ? (
              <PlatformRoleBadge platformRole={formData.platformRole} />
            ) : (
              <BodyTextInline>Standard</BodyTextInline>
            )}
          </Group>
          {selectedOrgs.length > 0 && (
            <Group justify="space-between">
              <BodyTextBold>Organisations:</BodyTextBold>
              <BodyTextInline>
                {selectedOrgs.map((o) => o.name).join(", ")}
              </BodyTextInline>
            </Group>
          )}
          {selectedSites.length > 0 && (
            <Group justify="space-between">
              <BodyTextBold>Sites:</BodyTextBold>
              <BodyTextInline>{selectedSites.join(", ")}</BodyTextInline>
            </Group>
          )}
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
  errorMessage,
}: Pick<StepContentProps, never> & {
  success: boolean;
  isEditMode?: boolean;
  errorMessage?: string;
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
        errorMessage ||
        (isEditMode
          ? "There was an error updating the user. Please try again."
          : "There was an error creating the user. Please try again.")
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
export default function UserInfoUpdatePage() {
  const navigate = useNavigate();
  const { id: userId } = useParams<{ id: string }>();
  const isEditMode = Boolean(userId);

  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [organisations, setOrganisations] = useState<OrgOption[]>([]);

  const [formData, setFormData] = useState<UserFormData>({
    name: "",
    email: "",
    username: "",
    password: "",
    baseProfession: "",
    additionalCompetencies: [],
    removedCompetencies: [],
    platformRole: "standard",
    orgUnitIds: [],
  });

  // Fetch user data in edit mode
  useEffect(() => {
    if (!isEditMode || !userId) return;

    async function fetchUser() {
      try {
        setLoading(true);
        // TODO: Backend needs to implement GET /api/users/:id endpoint
        const data = await api.get<{
          name?: string;
          email?: string;
          username?: string;
          base_profession?: string;
          additional_competencies?: string[];
          removed_competencies?: string[];
          platform_role?: PlatformRole;
          org_unit_ids?: number[];
          place_ids?: number[];
        }>(`/users/${userId}`);

        // Pre-fill form with user data
        setFormData({
          name: data.name || "",
          email: data.email || "",
          username: data.username || "",
          password: "", // Don't pre-fill password for security
          baseProfession: data.base_profession || "",
          additionalCompetencies: data.additional_competencies || [],
          removedCompetencies: data.removed_competencies || [],
          platformRole: data.platform_role || "standard",
          // org_unit_ids is the name the API answers in. place_ids is
          // the older name for the same list, read as a fallback so this
          // page works against a server from before the expand shipped.
          orgUnitIds: (data.org_unit_ids ?? data.place_ids ?? []).map(String),
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

  // Fetch every place the person may be put in, in one request
  useEffect(() => {
    async function fetchPlaces() {
      try {
        const places = await orgUnits.list();

        const byId = new Map(places.map((place) => [place.id, place]));

        /**
         * The organisation a place belongs to.
         *
         * Walked rather than read off the parent, because a ward can sit
         * inside a building inside a hospital, and it is still that
         * trust's ward. The walk is bounded by the number of places, so
         * a chain that somehow loops cannot hang the page.
         */
        function rootOf(place: OrgUnit): OrgUnit | undefined {
          let current: OrgUnit | undefined = place;
          for (let step = 0; step < places.length && current; step += 1) {
            if (current.is_root) return current;
            current =
              current.parent_id === null
                ? undefined
                : byId.get(current.parent_id);
          }
          return undefined;
        }

        const grouped = new Map<number, OrgOption>();
        for (const place of places) {
          if (place.is_root) {
            grouped.set(place.id, {
              id: place.id,
              name: place.name,
              sites: grouped.get(place.id)?.sites ?? [],
            });
          }
        }
        for (const place of places) {
          if (place.is_root) continue;
          const root = rootOf(place);
          // A place whose organisation is not in the answer is one the
          // person may administer without administering the tree above
          // it. It has nowhere to be listed, so it is left out rather
          // than shown under a name we do not have.
          if (!root) continue;
          grouped.get(root.id)?.sites.push({ id: place.id, name: place.name });
        }

        setOrganisations([...grouped.values()]);
      } catch (error) {
        console.error("Failed to fetch places:", error);
      }
    }

    fetchPlaces();
  }, []);

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
    navigate("/admin/users");
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
        platform_role: PlatformRole;
        password?: string;
        org_unit_ids: number[];
      } = {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        base_profession: formData.baseProfession,
        additional_competencies: formData.additionalCompetencies,
        removed_competencies: formData.removedCompetencies,
        platform_role: formData.platformRole,
        org_unit_ids: formData.orgUnitIds.map(Number),
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
      setActiveStep(5); // Move to confirmation step
    } catch (error) {
      console.error(
        `Failed to ${isEditMode ? "update" : "create"} user:`,
        error,
      );
      setSuccess(false);
      setErrorMessage(error instanceof Error ? error.message : null);
      setDirty(false); // Clear dirty flag even on error (user can retry from admin)
      setActiveStep(5); // Move to confirmation step even on error
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
      label: "Organisation/site",
      description: "Assign to organisation and site",
      content: (props) => (
        <Step2Organisation
          {...props}
          formData={formData}
          setFormData={updateFormData}
          organisations={organisations}
        />
      ),
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
      content: (props) => (
        <Step4Review
          {...props}
          formData={formData}
          organisations={organisations}
        />
      ),
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
          errorMessage={errorMessage ?? undefined}
        />
      ),
      hideCancelButton: true,
      hideCard: true,
      nextButtonLabel: "Finished",
    },
  ];

  // Intercept step 4 -> 5 transition to submit form
  function handleStepChange(newStep: number) {
    if (activeStep === 4 && newStep === 5) {
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
          <Center>
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <BodyText>Loading user data...</BodyText>
            </Stack>
          </Center>
        ) : loadError ? (
          <ErrorState
            title="Error loading user"
            message={loadError}
            action={{
              label: "Return to Admin",
              icon: "arrowLeft",
              onClick: () => navigate("/admin/users"),
            }}
          />
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
