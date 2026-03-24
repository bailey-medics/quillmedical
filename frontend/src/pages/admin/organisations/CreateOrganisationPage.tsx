/**
 * Create Organisation Page
 *
 * Form for creating a new organisation in the system.
 * Only accessible to admin/superadmin users.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Stack,
  Paper,
  TextInput,
  Select,
  Button,
  Group,
  Alert,
} from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import Icon from "@/components/icons";
import PageHeader from "@/components/page-header";
import { api } from "@/lib/api";

/** Organisation type options for the select input */
const ORGANISATION_TYPE_OPTIONS = [
  { value: "hospital_team", label: "Hospital team" },
  { value: "gp_practice", label: "GP practice" },
  { value: "private_clinic", label: "Private clinic" },
  { value: "department", label: "Department" },
];

/**
 * Create Organisation Page
 *
 * Renders a simple form for creating a new organisation with:
 * - Name (required)
 * - Type (required, select from predefined list)
 * - Location (optional)
 *
 * On success, navigates to the organisation list page.
 *
 * @returns Create organisation page component
 */
export default function CreateOrganisationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;
    setNameError(null);
    setTypeError(null);

    if (!name.trim()) {
      setNameError("Organisation name is required");
      valid = false;
    }
    if (!type) {
      setTypeError("Organisation type is required");
      valid = false;
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.post("/organizations", {
        name: name.trim(),
        type,
        location: location.trim() || null,
      });
      setSuccess(true);
      setTimeout(() => navigate("/admin/organisations"), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create organisation",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconCheck />} size="lg" />}
          title="Organisation created"
          color="green"
        >
          Redirecting to organisations list...
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Create organisation" />

        {error && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error creating organisation"
            color="red"
          >
            {error}
          </Alert>
        )}

        <Paper withBorder p="xl">
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Organisation name"
                placeholder="e.g. Great Eastern Hospital"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={nameError}
                withAsterisk
              />

              <Select
                label="Organisation type"
                placeholder="Select a type"
                data={ORGANISATION_TYPE_OPTIONS}
                value={type}
                onChange={setType}
                error={typeError}
                withAsterisk
              />

              <TextInput
                label="Location"
                placeholder="e.g. London"
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
              />

              <Group justify="flex-end" mt="md">
                <Button
                  variant="default"
                  onClick={() => navigate("/admin/organisations")}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={submitting}>
                  Create organisation
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
