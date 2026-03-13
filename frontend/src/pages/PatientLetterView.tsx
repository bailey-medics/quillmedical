/**
 * Patient Letter View Page
 *
 * Displays the full content of a single clinical letter for a patient.
 * Uses the shared LetterView component for rendering.
 */

import { usePatientLoader } from "@/hooks/usePatientLoader";
import { fakeLetters } from "@/data/fakeLetters";
import LetterView from "@/components/letters/LetterView";
import { Container } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function PatientLetterView() {
  const { id, letterId } = useParams<{ id: string; letterId: string }>();
  const { patient, setPatientNav } = usePatientLoader();
  const navigate = useNavigate();

  const letter = fakeLetters.find((l) => l.id === letterId);

  useEffect(() => {
    if (patient && id) {
      const nav = [
        { label: patient.name, href: `/patients/${id}` },
        { label: "Clinical letters", href: `/patients/${id}/letters` },
      ];
      if (letter) {
        nav.push({
          label: letter.title,
          href: `/patients/${id}/letters/${letterId}`,
        });
      }
      setPatientNav(nav);
    }
  }, [patient, id, letterId, letter, setPatientNav]);

  return (
    <Container size="lg" py="xl">
      <LetterView
        letter={
          letter
            ? {
                id: letter.id,
                subject: letter.title,
                date: letter.date,
                from: `${letter.author} — ${letter.authorRole}`,
                body: letter.body,
              }
            : null
        }
        onBack={() => navigate(`/patients/${id}/letters`)}
      />
    </Container>
  );
}
