/**
 * Edit Organisation Page
 *
 * Form for editing an existing organisation's details.
 * Loads the current details and allows updating name, type, and location.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Container,
  Stack,
  Paper,
  TextInput,
  Select,
  Button,
  Group,
  Alert,
  Skeleton,
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

interface OrganisationData {
  id: number;
  name: string;
  type: string;
  location: string | null;
}

export default function EditOrganisationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganisation() {
      try {
        const data = await api.get<OrganisationData>(`/organizations/${id}`);
        setName(data.name);
        setType(data.type);
        setLocation(data.location || "");
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load organisation",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchOrganisation();
  }, [id]);

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
      await api.put(`/organizations/${id}`, {
        name: name.trim(),
        type,
        location: location.trim() || null,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/admin/organisations/${id}`), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update organisation",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading organisation"
          color="red"
        >
          {loadError}
        </Alert>
      </Container>
    );
  }

  if (success) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconCheck />} size="lg" />}
          title="Organisation updated"
          color="green"
        >
          Redirecting to organisation...
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader
          title="Edit organisation"
          description="Update organisation details"
          size="lg"
        />

        {error && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error updating organisation"
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
                  onClick={() => navigate(`/admin/organisations/${id}`)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={submitting}>
                  Save changes
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
