import PatientsList from "@/components/patients/PatientsList";
import type { Patient } from "@/domains/patient";
import { api } from "@/lib/api";
import { Stack } from "@mantine/core";
import { useEffect, useState } from "react";

type Demographics = {
  given_name?: string | null;
  family_name?: string | null;
  date_of_birth?: string | null;
  sex?: string | null;
};

type PatientsApiRes = {
  patients: Array<{ repo: string; demographics?: Demographics | null }>;
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
        const mapped: Patient[] = (res.patients || []).map((p) => {
          const demo = p.demographics || {};
          return {
            id: p.repo,
            name:
              demo?.given_name || demo?.family_name
                ? [demo.given_name, demo.family_name].filter(Boolean).join(" ")
                : p.repo,
            dob: demo?.date_of_birth ?? undefined,
            age: undefined,
            sex: demo?.sex ?? undefined,
            onQuill: true,
          } as Patient;
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
