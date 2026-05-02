/**
 * Patient Clinical Letters Page
 *
 * Displays clinical letters for a specific patient. Currently uses fake
 * data for demonstration purposes.
 */

import { LetterList, type LetterSummary } from "@/components/letters";
import { fakeLetters } from "@/data/fakeLetters";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Heading } from "@/components/typography";
import { Container, Stack } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function PatientLetters() {
  const { patient, setPatientNav } = usePatientLoader();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (patient && id) {
      setPatientNav([
        { label: patient.name, href: `/patients/${id}` },
        { label: "Clinical letters", href: `/patients/${id}/letters` },
      ]);
    }
  }, [patient, id, setPatientNav]);

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Heading>Clinical letters</Heading>

        <LetterList
          letters={fakeLetters}
          onLetterClick={(letter: LetterSummary) =>
            navigate(`/patients/${id}/letters/${letter.id}`)
          }
        />
      </Stack>
    </Container>
  );
}
