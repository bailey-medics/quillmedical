/**
 * Home Page Module
 *
 * Main dashboard page displaying the list of all patients from the FHIR server.
 * Fetches patient demographics, maps FHIR R4 Patient resources to internal Patient
 * type, and displays them in a card-based list view.
 */

import PatientsList from "@/components/patients/PatientsList";
import type { Patient } from "@/domains/patient";
import { api } from "@/lib/api";
import { extractAvatarGradientIndex } from "@/lib/fhir-patient";
import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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
 * Patients API Response
 *
 * Response structure from GET /api/patients.
 */
type PatientsApiRes = {
  /** Array of FHIR Patient resources */
  patients: FhirPatient[];
};

/**
 * Home Page
 *
 * Main application dashboard displaying all patients from the FHIR server.
 * Automatically fetches patients on mount, maps FHIR resources to internal
 * Patient type with computed fields (age, formatted name, NHS number extraction),
 * and displays loading/error states.
 *
 * FHIR Mapping Logic:
 * - Concatenates given + family names into single display name
 * - Extracts NHS number from identifiers with NHS system URI
 * - Calculates age from birth date accounting for leap years
 * - Maps FHIR gender to sex field
 *
 * @example
 * // Routing configuration
 * <Route path="/" element={
 *   <RequireAuth>
 *     <Home />
 *   </RequireAuth>
 * } />
 */
export default function Home() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch patients function
  const fetchPatients = () => {
    let cancelled = false;
    setIsLoading(true);
    api
      .get<PatientsApiRes>("/patients")
      .then((res) => {
        if (cancelled) return;
        console.log("Raw FHIR patients:", res.patients);
        const mapped: Patient[] = (res.patients || []).map((fhirPatient) => {
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
              (id) => id.system === "https://fhir.nhs.uk/Id/nhs-number",
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

          // Extract avatar gradient index from FHIR extension
          const gradientIndex = extractAvatarGradientIndex(fhirPatient);

          const patient = {
            id: fhirPatient.id,
            name: displayName,
            dob: fhirPatient.birthDate ?? undefined,
            age: age,
            sex: fhirPatient.gender ?? undefined,
            nhsNumber: nhsNumber,
            gradientIndex: gradientIndex,
            onQuill: true,
          } as Patient;

          console.log("Mapped patient:", patient);
          return patient;
        });

        // Only update state if data has actually changed
        setPatients((currentPatients) => {
          // If no current patients, always set the new ones
          if (!currentPatients) {
            return mapped;
          }

          // Compare patient lists by IDs
          const currentIds = currentPatients
            .map((p) => p.id)
            .sort()
            .join(",");
          const newIds = mapped
            .map((p) => p.id)
            .sort()
            .join(",");

          // Only update if patient list has changed
          if (currentIds !== newIds) {
            return mapped;
          }

          return currentPatients;
        });
        setError(null);
      })
      .catch((err: Error & { error_code?: string }) => {
        if (cancelled) return;
        setError(err.message || "Failed to load patients");
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  // Fetch on mount
  useEffect(() => {
    const cleanup = fetchPatients();
    return cleanup;
  }, []);

  // Auto-refresh every 30 seconds - fetches data but only updates UI if changed
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPatients();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Stack
      align="center"
      justify="center"
      style={{ minHeight: "70vh", padding: "2rem", margin: "0 auto" }}
    >
      <PatientsList
        patients={patients ?? []}
        isLoading={isLoading}
        onSelect={(patient) => navigate(`/patients/${patient.id}`)}
      />
      {error ? <div style={{ color: "red" }}>{error}</div> : null}
    </Stack>
  );
}
