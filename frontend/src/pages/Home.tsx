import PatientsList from "@/components/patients/PatientsList";
import type { Patient } from "@/domains/patient";
import { api } from "@/lib/api";
import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";

// FHIR Patient resource structure
type FhirName = {
  given?: string[];
  family?: string;
  use?: string;
};

type FhirIdentifier = {
  system?: string;
  value?: string;
};

type FhirPatient = {
  resourceType: string;
  id: string;
  name?: FhirName[];
  birthDate?: string;
  gender?: string;
  identifier?: FhirIdentifier[];
};

type PatientsApiRes = {
  patients: FhirPatient[];
};

export default function Home() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

          const patient = {
            id: fhirPatient.id,
            name: displayName,
            dob: fhirPatient.birthDate ?? undefined,
            age: age,
            sex: fhirPatient.gender ?? undefined,
            nhsNumber: nhsNumber,
            onQuill: true,
          } as Patient;

          console.log("Mapped patient:", patient);
          return patient;
        });
        setPatients(mapped);
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
  }, []);

  return (
    <Stack
      align="center"
      justify="center"
      style={{ minHeight: "70vh", padding: "2rem", margin: "0 auto" }}
    >
      <PatientsList patients={patients ?? []} isLoading={isLoading} />
      {error ? <div style={{ color: "red" }}>{error}</div> : null}
    </Stack>
  );
}
