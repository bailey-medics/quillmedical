/**
 * Add Patient to Organisation Page
 *
 * Form for adding a patient to an organisation.
 * Fetches the list of patients from FHIR and allows selection via a searchable select.
 * Only accessible to admin/superadmin users.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Container, Stack, Alert } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";
import SelectField from "@/components/form/SelectField";
import PageHeader from "@/components/page-header";
import { api } from "@/lib/api";

interface FhirPatient {
  id: string;
  name?: Array<{ given?: string[]; family?: string }>;
}

interface PatientsApiResponse {
  patients: FhirPatient[];
  fhir_ready: boolean;
}

function getPatientDisplayName(patient: FhirPatient): string {
  const name = patient.name?.[0];
  const given = name?.given?.[0] ?? "";
  const family = name?.family ?? "";
  return `${given} ${family}`.trim() || `Patient ${patient.id}`;
}

export default function AddPatientToOrgPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<FhirPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const response = await api.get<PatientsApiResponse>(
          "/patients?scope=admin",
        );
        if (response.fhir_ready) {
          setPatients(response.patients);
          setPatientsLoading(false);
        } else {
          setError("FHIR server is not ready. Please try again later.");
          setPatientsLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load patients",
        );
        setPatientsLoading(false);
      }
    }

    fetchPatients();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSelectError(null);

    if (!selectedPatientId) {
      setSelectError("Please select a patient");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/organizations/${id}/patients`, {
        patient_id: selectedPatientId,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/admin/organisations/${id}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add patient");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Container size="lg" py="xl">
        <Alert
          icon={<Icon icon={<IconCheck />} size="lg" />}
          title="Patient added"
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
        <PageHeader title="Add patient" />

        {error && (
          <Alert
            icon={<Icon icon={<IconAlertCircle />} size="lg" />}
            title="Error"
            color="red"
          >
            {error}
          </Alert>
        )}

        <BaseCard>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <SelectField
                label="Patient"
                placeholder="Search for a patient"
                data={patients.map((p) => ({
                  value: p.id,
                  label: getPatientDisplayName(p),
                }))}
                value={selectedPatientId}
                onChange={setSelectedPatientId}
                error={selectError}
                searchable
                disabled={patientsLoading}
                withAsterisk
              />

              <ButtonPair
                acceptLabel="Add patient"
                acceptType="submit"
                acceptLoading={submitting}
                acceptDisabled={patientsLoading}
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
