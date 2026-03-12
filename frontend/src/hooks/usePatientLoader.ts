/**
 * usePatientLoader Hook
 *
 * Shared hook that loads patient demographics from the FHIR backend and
 * populates the top ribbon via setPatient. Used by the Patient detail page
 * and its sub-pages (letters, notes, appointments, messages).
 */

import type { Patient } from "@/domains/patient";
import type { LayoutCtx } from "@/RootLayout";
import { api } from "@/lib/api";
import { extractAvatarGradientIndex } from "@/lib/fhir-patient";
import { useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";

type FhirName = {
  given?: string[];
  family?: string;
  use?: string;
};

type FhirIdentifier = {
  system?: string;
  value?: string;
};

type FhirExtension = {
  url?: string;
  valueInteger?: number;
  valueString?: string;
  extension?: FhirExtension[];
};

type FhirPatient = {
  resourceType: string;
  id: string;
  name?: FhirName[];
  birthDate?: string;
  gender?: string;
  identifier?: FhirIdentifier[];
  extension?: FhirExtension[];
};

type PatientDemographicsRes = {
  patient_id: string;
  data: FhirPatient;
};

type UsePatientLoaderResult = {
  id: string | undefined;
  patient: Patient | null;
  isLoading: boolean;
  error: string | null;
};

export function usePatientLoader(): UsePatientLoaderResult {
  const { id } = useParams<{ id: string }>();
  const { patient, setPatient } = useOutletContext<LayoutCtx>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No patient ID provided");
      setIsLoading(false);
      return;
    }

    // If patient is already loaded for this ID, skip the API call
    if (loadedIdRef.current === id || (patient && patient.id === id)) {
      loadedIdRef.current = id;
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

        let displayName = fhirPatient.id;
        let givenName: string | undefined;
        let familyName: string | undefined;
        if (fhirPatient.name && fhirPatient.name.length > 0) {
          const primaryName = fhirPatient.name[0];
          const givenNames = primaryName.given || [];
          familyName = primaryName.family || undefined;
          givenName = givenNames[0] || undefined;
          const nameParts = [...givenNames, familyName].filter(Boolean);
          if (nameParts.length > 0) {
            displayName = nameParts.join(" ");
          }
        }

        let nationalNumber: string | undefined;
        let nationalNumberSystem: string | undefined;
        if (fhirPatient.identifier && fhirPatient.identifier.length > 0) {
          const nationalIdentifier = fhirPatient.identifier.find(
            (identifier) =>
              identifier.system === "https://fhir.nhs.uk/Id/nhs-number" ||
              identifier.system ===
                "http://ns.electronichealth.net.au/id/medicare-number" ||
              identifier.system?.includes("/national") ||
              identifier.system?.includes("/health-id"),
          );
          if (nationalIdentifier) {
            nationalNumber = nationalIdentifier.value;
            nationalNumberSystem = nationalIdentifier.system;
          }
        }

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

        const gradientIndex = extractAvatarGradientIndex(fhirPatient);

        const mappedPatient: Patient = {
          id: fhirPatient.id,
          name: displayName,
          givenName: givenName,
          familyName: familyName,
          dob: fhirPatient.birthDate ?? undefined,
          age: age,
          sex: fhirPatient.gender ?? undefined,
          nationalNumber: nationalNumber,
          nationalNumberSystem: nationalNumberSystem,
          gradientIndex: gradientIndex,
          onQuill: true,
        };

        setPatient(mappedPatient);
        loadedIdRef.current = id;
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
      loadedIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patient intentionally excluded to prevent infinite loop
  }, [id, setPatient]);

  return { id, patient, isLoading, error };
}
