/**
 * New Patient Page
 *
 * Multi-step form for creating a new patient with:
 * - Step 1: Patient demographics (FHIR data)
 * - Step 2: Optional user account creation
 * - Step 3: Confirmation
 *
 * @module NewPatientPage
 */

import {
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Alert,
  Checkbox,
  Divider,
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
import { api } from "@/lib/api";

/**
 * Patient form data state
 */
interface PatientFormData {
  firstName: string;
  lastName: string;
  dob: string;
  sex: "male" | "female" | "other" | "";
  nationalNumber: string;
  nationalNumberSystem: string;
  createUserAccount: boolean;
  userEmail?: string;
  userUsername?: string;
  userPassword?: string;
}

/**
 * Step 1: Patient Demographics
 */
function Step1Demographics({
  formData,
  setFormData,
  errors,
}: StepContentProps & {
  formData: PatientFormData;
  setFormData: (data: PatientFormData) => void;
  errors: Record<string, string>;
}) {
  const nationalNumberSystemOptions = [
    {
      value: "https://fhir.nhs.uk/Id/nhs-number",
      label: "NHS Number (UK)",
    },
    {
      value: "http://ns.electronichealth.net.au/id/medicare-number",
      label: "Medicare Number (AU)",
    },
    {
      value: "http://hl7.org/fhir/sid/us-ssn",
      label: "Social Security Number (US)",
    },
  ];

  const sexOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
  ];

  return (
    <Stack gap="md">
      <Title order={3}>Patient Demographics</Title>
      <Text size="sm" c="dimmed">
        Enter the patient's demographic information for their FHIR record.
      </Text>

      <Group grow>
        <TextInput
          label="First Name"
          placeholder="Jane"
          required
          value={formData.firstName}
          onChange={(e) =>
            setFormData({ ...formData, firstName: e.currentTarget.value })
          }
          error={errors.firstName}
        />

        <TextInput
          label="Last Name"
          placeholder="Smith"
          required
          value={formData.lastName}
          onChange={(e) =>
            setFormData({ ...formData, lastName: e.currentTarget.value })
          }
          error={errors.lastName}
        />
      </Group>

      <Group grow>
        <TextInput
          label="Date of Birth"
          placeholder="YYYY-MM-DD"
          required
          type="date"
          value={formData.dob}
          onChange={(e) =>
            setFormData({ ...formData, dob: e.currentTarget.value })
          }
          error={errors.dob}
        />

        <Select
          label="Sex"
          placeholder="Select sex"
          data={sexOptions}
          required
          value={formData.sex}
          onChange={(value) =>
            setFormData({ ...formData, sex: value as typeof formData.sex })
          }
          error={errors.sex}
        />
      </Group>

      <Select
        label="National Number System"
        placeholder="Select national number system"
        data={nationalNumberSystemOptions}
        required
        value={formData.nationalNumberSystem}
        onChange={(value) =>
          setFormData({
            ...formData,
            nationalNumberSystem: value || "",
          })
        }
        error={errors.nationalNumberSystem}
        searchable
      />

      <TextInput
        label="National Number"
        placeholder="1234567890"
        required
        value={formData.nationalNumber}
        onChange={(e) =>
          setFormData({ ...formData, nationalNumber: e.currentTarget.value })
        }
        error={errors.nationalNumber}
      />
    </Stack>
  );
}

/**
 * Step 2: Optional User Account
 */
function Step2UserAccount({
  formData,
  setFormData,
  errors,
}: {
  formData: PatientFormData;
  setFormData: (data: PatientFormData) => void;
  errors: Record<string, string>;
}) {
  return (
    <Stack gap="md">
      <Title order={3}>User Account (Optional)</Title>
      <Text size="sm" c="dimmed">
        Create a user account for this patient to enable portal access.
      </Text>

      <Checkbox
        label="Create user account for patient portal access"
        checked={formData.createUserAccount}
        onChange={(e) =>
          setFormData({
            ...formData,
            createUserAccount: e.currentTarget.checked,
          })
        }
      />

      {formData.createUserAccount && (
        <>
          <Divider my="sm" />

          <Alert variant="light" color="blue">
            <Text size="sm">
              Patient will be able to log in and access their health records.
            </Text>
          </Alert>

          <TextInput
            label="Email"
            placeholder="jane.smith@example.com"
            required
            type="email"
            value={formData.userEmail || ""}
            onChange={(e) =>
              setFormData({ ...formData, userEmail: e.currentTarget.value })
            }
            error={errors.userEmail}
          />

          <TextInput
            label="Username"
            placeholder="janesmith"
            required
            value={formData.userUsername || ""}
            onChange={(e) =>
              setFormData({ ...formData, userUsername: e.currentTarget.value })
            }
            error={errors.userUsername}
          />

          <TextInput
            label="Initial Password"
            placeholder="Must be at least 8 characters"
            required
            type="password"
            value={formData.userPassword || ""}
            onChange={(e) =>
              setFormData({ ...formData, userPassword: e.currentTarget.value })
            }
            error={errors.userPassword}
          />
        </>
      )}
    </Stack>
  );
}

/**
 * Step 3: Confirmation
 */
function Step3Confirmation({
  success,
  patientId,
  onCancel,
}: StepContentProps & {
  success: boolean;
  patientId?: string;
}) {
  return (
    <Stack gap="md" align="center" py="xl">
      {success ? (
        <>
          <IconCheck size={64} color="green" />
          <Title order={2}>Patient Created Successfully</Title>
          <Text size="sm" c="dimmed" ta="center">
            The new patient record has been created in the FHIR system.
          </Text>
          {patientId && (
            <Text size="sm" c="dimmed" ta="center">
              Patient ID: {patientId}
            </Text>
          )}
          <Button onClick={onCancel} mt="lg">
            Return to Admin
          </Button>
        </>
      ) : (
        <>
          <IconAlertCircle size={64} color="red" />
          <Title order={2}>Failed to Create Patient</Title>
          <Text size="sm" c="dimmed" ta="center">
            There was an error creating the patient record. Please try again.
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
 * New Patient Page Component
 *
 * Multi-step form for creating new patient records with optional user accounts.
 *
 * @returns New patient creation page
 */
export default function NewPatientPage() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [patientId, setPatientId] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const [formData, setFormData] = useState<PatientFormData>({
    firstName: "",
    lastName: "",
    dob: "",
    sex: "",
    nationalNumber: "",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    createUserAccount: false,
  });

  // Block navigation when form is dirty and not yet submitted
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !success && currentLocation.pathname !== nextLocation.pathname,
  );

  // Wrapper to set form data and mark as dirty
  function updateFormData(newData: PatientFormData) {
    setFormData(newData);
    setDirty(true);
  }

  function handleCancel() {
    setDirty(false); // Allow navigation
    navigate("/admin");
  }

  function validateStep1(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }
    if (!formData.dob.trim()) {
      newErrors.dob = "Date of birth is required";
    }
    if (!formData.sex) {
      newErrors.sex = "Sex is required";
    }
    if (!formData.nationalNumber.trim()) {
      newErrors.nationalNumber = "National number is required";
    }
    if (!formData.nationalNumberSystem) {
      newErrors.nationalNumberSystem = "National number system is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateStep2(): boolean {
    if (!formData.createUserAccount) {
      return true;
    }

    const newErrors: Record<string, string> = {};

    if (!formData.userEmail?.trim()) {
      newErrors.userEmail = "Email is required";
    } else if (
      !formData.userEmail.includes("@") ||
      !formData.userEmail.includes(".")
    ) {
      newErrors.userEmail = "Invalid email format";
    }
    if (!formData.userUsername?.trim()) {
      newErrors.userUsername = "Username is required";
    }
    if (!formData.userPassword?.trim()) {
      newErrors.userPassword = "Password is required";
    } else if ((formData.userPassword?.length || 0) < 8) {
      newErrors.userPassword = "Password must be at least 8 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (submitting) return;

    setSubmitting(true);
    try {
      // Create patient - using FHIR field names expected by backend
      const patientResponse = await api.post<{ id: string }>("/patients", {
        given_name: formData.firstName,
        family_name: formData.lastName,
        birth_date: formData.dob,
        gender: formData.sex,
        nhs_number: formData.nationalNumber,
        // Note: Backend only supports NHS number currently, not national_number_system
      });

      const newPatientId = patientResponse.id;
      setPatientId(newPatientId);

      // Create user account if requested
      if (formData.createUserAccount) {
        await api.post("/auth/register", {
          username: formData.userUsername,
          email: formData.userEmail,
          password: formData.userPassword,
        });

        // TODO: Link user to patient and set system_permissions to "patient"
        // Note: Backend /auth/register creates basic user without roles
        // Will need additional endpoint to set base_profession and link to patient
      }

      setSuccess(true);
      setDirty(false); // Clear dirty flag on successful submission
      setActiveStep(2); // Move to confirmation step
    } catch (error) {
      console.error("Failed to create patient:", error);
      setSuccess(false);
      setDirty(false); // Clear dirty flag even on error (user can retry from admin)
      setActiveStep(2); // Move to confirmation step even on error
    } finally {
      setSubmitting(false);
    }
  }

  const steps: StepConfig[] = [
    {
      label: "Demographics",
      description: "Patient information",
      content: (props) => (
        <Step1Demographics
          {...props}
          formData={formData}
          setFormData={updateFormData}
          errors={errors}
        />
      ),
      validate: validateStep1,
    },
    {
      label: "User Account",
      description: "Optional portal access",
      content: (props) => (
        <Step2UserAccount
          {...props}
          formData={formData}
          setFormData={updateFormData}
          errors={errors}
        />
      ),
      validate: validateStep2,
      nextButtonLabel: "Add Patient",
    },
    {
      label: "Confirmation",
      description: "Patient created",
      content: (props) => (
        <Step3Confirmation {...props} success={success} patientId={patientId} />
      ),
    },
  ];

  // Intercept step 1 -> 2 transition to submit form
  function handleStepChange(newStep: number) {
    if (activeStep === 1 && newStep === 2) {
      handleSubmit();
    } else {
      setActiveStep(newStep);
    }
  }

  return (
    <>
      <Box p="xl" maw={900} mx="auto">
        <PageHeader title="Create New Patient" size="lg" />
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
