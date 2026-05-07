/**
 * Edit Organisation Page
 *
 * Form for editing an existing organisation's details.
 * Loads the current details and allows updating name, type, and location.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Stack, Alert, Skeleton } from "@mantine/core";
import { IconAlertCircle } from "@components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";
import { ResultMessage } from "@/components/message-cards";
import TextField from "@/components/form/TextField";
import SelectField from "@/components/form/SelectField";
import PageHeader from "@/components/page-header";
import { api } from "@/lib/api";

/** Organisation type options for the select input */
const ORGANISATION_TYPE_OPTIONS = [
  { value: "hospital_team", label: "Hospital team" },
  { value: "gp_practice", label: "GP practice" },
  { value: "private_clinic", label: "Private clinic" },
  { value: "department", label: "Department" },
  { value: "teaching_establishment", label: "Teaching establishment" },
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
          color="var(--alert-color)"
        >
          {loadError}
        </Alert>
      </Container>
    );
  }

  if (success) {
    return (
      <Container size="lg" py="xl">
        <ResultMessage
          variant="success"
          title="Organisation updated"
          subtitle="Redirecting to organisation..."
        />
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PageHeader title="Edit organisation" />

        {error && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error updating organisation"
            color="var(--alert-color)"
          >
            {error}
          </Alert>
        )}

        <BaseCard>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextField
                label="Organisation name"
                placeholder="e.g. Great Eastern Hospital"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={nameError}
                withAsterisk
              />

              <SelectField
                label="Organisation type"
                placeholder="Select a type"
                data={ORGANISATION_TYPE_OPTIONS}
                value={type}
                onChange={setType}
                error={typeError}
                withAsterisk
              />

              <TextField
                label="Location"
                placeholder="e.g. London"
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value)}
              />

              <ButtonPair
                acceptLabel="Save changes"
                acceptType="submit"
                acceptLoading={submitting}
                onAccept={() => {}}
                onCancel={() => navigate(`/admin/organisations/${id}`)}
              />
            </Stack>
          </form>
        </BaseCard>
      </Stack>
    </Container>
  );
}
