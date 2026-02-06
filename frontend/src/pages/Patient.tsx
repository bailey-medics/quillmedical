/**
 * Patient Detail Page Module
 *
 * Displays detailed information for a specific patient including demographics
 * in the top ribbon (via outlet context) and placeholder content for future
 * features (clinical letters, messaging, etc.).
 */

import type { Patient } from "@/domains/patient";
import type { LayoutCtx } from "@/RootLayout";
import { api } from "@/lib/api";
import { Card, Container, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";

/**
 * FHIR Name
 *
 * FHIR R4 HumanName structure containing name components.
 */
type FhirName = {
  /** Array of given names (first, middle) */
  given?: string[];
  /** Family name (surname) */
  family?: string;
  /** Name use context (usual, official, temp, etc.) */
  use?: string;
};

/**
 * FHIR Identifier
 *
 * FHIR R4 Identifier structure for patient identifiers (NHS number, MRN, etc.).
 */
type FhirIdentifier = {
  /** Identifier system/namespace (e.g., https://fhir.nhs.uk/Id/nhs-number) */
  system?: string;
  /** Identifier value (e.g., 10-digit NHS number) */
  value?: string;
};

/**
 * FHIR Patient
 *
 * FHIR R4 Patient resource structure returned from backend.
 */
type FhirPatient = {
  /** FHIR resource type (always "Patient") */
  resourceType: string;
  /** Unique FHIR resource ID */
  id: string;
  /** Array of patient names (official, usual, etc.) */
  name?: FhirName[];
  /** Date of birth in YYYY-MM-DD format */
  birthDate?: string;
  /** Administrative gender (male, female, other, unknown) */
  gender?: string;
  /** Array of patient identifiers (NHS number, MRN, etc.) */
  identifier?: FhirIdentifier[];
};

/**
 * Patient Demographics API Response
 *
 * Response structure from GET /api/patients/{id}/demographics.
 */
type PatientDemographicsRes = {
  /** Patient FHIR ID */
  patient_id: string;
  /** FHIR Patient resource */
  data: FhirPatient;
};

/**
 * Patient Detail Page
 *
 * Displays a patient's information in the top ribbon (via outlet context)
 * and main content area with placeholder sections for future features.
 *
 * URL Parameters:
 * - id: Patient FHIR resource ID
 *
 * @example
 * // Routing configuration
 * <Route path="/patients/:id" element={<Patient />} />
 */
export default function Patient() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setPatient } = useOutletContext<LayoutCtx>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No patient ID provided");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    api
      .get<PatientDemographicsRes>(`/patients/${id}/demographics`)
      .then((res) => {
        if (cancelled) return;

        const fhirPatient = res.data;

        // Extract name from FHIR structure
        let displayName = fhirPatient.id;
        if (fhirPatient.name && fhirPatient.name.length > 0) {
          const primaryName = fhirPatient.name[0];
          const givenNames = primaryName.given || [];
          const familyName = primaryName.family || "";
          const nameParts = [...givenNames, familyName].filter(Boolean);
          if (nameParts.length > 0) {
            displayName = nameParts.join(" ");
          }
        }

        // Extract NHS number from identifiers
        let nhsNumber: string | undefined;
        if (fhirPatient.identifier && fhirPatient.identifier.length > 0) {
          const nhsIdentifier = fhirPatient.identifier.find(
            (identifier) =>
              identifier.system === "https://fhir.nhs.uk/Id/nhs-number",
          );
          if (nhsIdentifier) {
            nhsNumber = nhsIdentifier.value;
          }
        }

        // Calculate age from birthDate
        let age: number | undefined;
        if (fhirPatient.birthDate) {
          const birthDate = new Date(fhirPatient.birthDate);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age--;
          }
        }

        const mappedPatient: Patient = {
          id: fhirPatient.id,
          name: displayName,
          dob: fhirPatient.birthDate ?? undefined,
          age: age,
          sex: fhirPatient.gender ?? undefined,
          nhsNumber: nhsNumber,
          onQuill: true,
        };

        setPatient(mappedPatient);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Failed to load patient details");
        setPatient(null);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      setPatient(null);
    };
  }, [id, setPatient]);

  if (isLoading) {
    return (
      <Container size="lg" py="xl">
        <Text>Loading patient details...</Text>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text c="red">{error}</Text>
          <Text
            component="button"
            onClick={() => navigate("/")}
            style={{
              cursor: "pointer",
              marginTop: "1rem",
              color: "blue",
              textDecoration: "underline",
            }}
          >
            ← Back to patient list
          </Text>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            Clinical Letters
          </Title>
          <Text c="dimmed">
            Placeholder: Clinical letters will be displayed here
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            Messaging
          </Title>
          <Text c="dimmed">
            Placeholder: Patient messaging interface will be displayed here
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            Clinical Notes
          </Title>
          <Text c="dimmed">
            Placeholder: Clinical notes and observations will be displayed here
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">
            Appointments
          </Title>
          <Text c="dimmed">
            Placeholder: Appointment history and upcoming appointments will be
            displayed here
          </Text>
        </Card>
      </Stack>
    </Container>
  );
}
