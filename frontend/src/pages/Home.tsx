/**
 * Home Page Module
 *
 * Main dashboard page displaying the list of all patients from the FHIR server.
 * Fetches patient demographics, maps FHIR R4 Patient resources to internal Patient
 * type, and displays them in a card-based list view.
 */

import PatientsList from "@/components/patients";
import type { Patient } from "@/domains/patient";
import { api } from "@/lib/api";
import { FHIR_POLLING_TIME, FHIR_REFRESH_TIME } from "@/lib/constants";
import { extractAvatarGradientIndex } from "@/lib/fhir-patient";
import { Container, Stack } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
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
 * FHIR R4 Identifier structure for patient identifiers (national health IDs, MRN, etc.).
 */
type FhirIdentifier = {
  /** Identifier system/namespace (e.g., https://fhir.nhs.uk/Id/nhs-number, national health ID URIs) */
  system?: string;
  /** Identifier value (e.g., 10-digit NHS number, Medicare number, etc.) */
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
  /** Whether FHIR server is fully ready to serve data */
  fhir_ready: boolean;
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
 * FHIR Readiness:
 * - Uses fhir_ready flag from /patients endpoint (not separate health checks)
 * - Eliminates race conditions during FHIR initialization
 * - Shows "Database is initialising" only when fhir_ready=false
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
  const [fhirAvailable, setFhirAvailable] = useState(false);
  const hasLoadedPatientsWithData = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isFhirReady, setIsFhirReady] = useState(false);

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

          // Extract national health identifier from identifiers
          // This could be NHS number (UK), Medicare number (AU), etc.
          let nationalNumber: string | undefined;
          let nationalNumberSystem: string | undefined;
          if (fhirPatient.identifier && fhirPatient.identifier.length > 0) {
            // Try to find a national health identifier (prioritize common systems)
            const nationalIdentifier = fhirPatient.identifier.find(
              (id) =>
                id.system === "https://fhir.nhs.uk/Id/nhs-number" ||
                id.system ===
                  "http://ns.electronichealth.net.au/id/medicare-number" ||
                id.system?.includes("/national") ||
                id.system?.includes("/health-id"),
            );
            if (nationalIdentifier) {
              nationalNumber = nationalIdentifier.value;
              nationalNumberSystem = nationalIdentifier.system;
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
            nationalNumber: nationalNumber,
            nationalNumberSystem: nationalNumberSystem,
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

        // Only mark FHIR as truly ready once we've successfully loaded patients with data
        // This prevents showing "No patients" when FHIR returns [] during initialization
        // before patient indexes are fully built
        if (mapped.length > 0) {
          hasLoadedPatientsWithData.current = true;
          setFhirAvailable(true);
        } else if (hasLoadedPatientsWithData.current) {
          // If we've previously loaded patients, trust that FHIR is ready
          setFhirAvailable(res.fhir_ready);
        } else {
          // Haven't seen patients yet, keep showing "initializing"
          setFhirAvailable(false);
        }
      })
      .catch((err: Error & { error_code?: string }) => {
        if (cancelled) return;
        setError(err.message || "Failed to load patients");
        setFhirAvailable(false);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  // Poll health endpoint every 5 seconds until FHIR is ready
  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const response = await api.get<{
          status: string;
          services: {
            fhir: {
              available: boolean;
              status_code?: number;
              error?: string;
            };
          };
        }>("/health");

        if (cancelled) return;

        if (response.services.fhir.available) {
          setIsFhirReady(true);
          setFhirAvailable(true); // FHIR is ready, prevent "database initialising" message
          // isLoading stays true, fetchPatients will handle showing loading state
        } else {
          // FHIR not ready yet - stop loading, show "database is initialising"
          setIsLoading(false);
          setFhirAvailable(false);
        }
      } catch (err) {
        console.error("Health check failed:", err);
        if (!cancelled) {
          setIsFhirReady(false);
          setIsLoading(false);
          setFhirAvailable(false);
        }
      }
    };

    // Check immediately on mount
    checkHealth();

    // Poll every 5 seconds until FHIR is ready
    const interval = setInterval(() => {
      if (!isFhirReady) {
        checkHealth();
      }
    }, FHIR_POLLING_TIME);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isFhirReady]);

  // Fetch patients when FHIR becomes ready
  useEffect(() => {
    if (!isFhirReady) return;

    const cleanup = fetchPatients();
    return cleanup;
  }, [isFhirReady]);

  // Auto-refresh every 30 seconds once FHIR is ready
  useEffect(() => {
    if (!isFhirReady) return;

    const interval = setInterval(() => {
      fetchPatients();
    }, FHIR_REFRESH_TIME);
    return () => clearInterval(interval);
  }, [isFhirReady]);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <PatientsList
          patients={patients ?? []}
          isLoading={isLoading}
          fhirAvailable={fhirAvailable}
          onSelect={(patient) => navigate(`/patients/${patient.id}`)}
        />
        {error ? <div style={{ color: "red" }}>{error}</div> : null}
      </Stack>
    </Container>
  );
}
