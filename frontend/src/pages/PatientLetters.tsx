/**
 * Patient Clinical Letters Page
 *
 * Displays clinical letters for a specific patient. Currently uses fake
 * data for demonstration purposes.
 */

import { fakeLetters } from "@/data/fakeLetters";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import {
  Badge,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function getStatusColour(status: string): string {
  switch (status) {
    case "final":
      return "green";
    case "draft":
      return "yellow";
    case "amended":
      return "blue";
    default:
      return "gray";
  }
}

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
        <Title order={2}>
          Clinical letters
          {patient?.givenName ? ` — ${patient.givenName}` : ""}
        </Title>

        {fakeLetters.map((letter) => (
          <Card
            key={letter.id}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/patients/${id}/letters/${letter.id}`)}
          >
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={4}>{letter.title}</Title>
                <Badge
                  color={getStatusColour(letter.status)}
                  variant="light"
                  size="lg"
                >
                  {letter.status}
                </Badge>
              </Group>
              <Group gap="lg">
                <Text size="sm" c="dimmed">
                  {new Date(letter.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
                <Text size="sm" c="dimmed">
                  {letter.author} — {letter.authorRole}
                </Text>
              </Group>
              <Text size="md">{letter.summary}</Text>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
