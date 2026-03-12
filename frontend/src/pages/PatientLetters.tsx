/**
 * Patient Clinical Letters Page
 *
 * Displays clinical letters for a specific patient. Currently uses fake
 * data for demonstration purposes.
 */

import { usePatientLoader } from "@/hooks/usePatientLoader";
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

type ClinicalLetter = {
  id: string;
  title: string;
  date: string;
  author: string;
  authorRole: string;
  status: "final" | "draft" | "amended";
  summary: string;
};

const fakeLetters: ClinicalLetter[] = [
  {
    id: "letter-1",
    title: "Gastroenterology outpatient clinic letter",
    date: "2026-03-19",
    author: "Dr David Corbett",
    authorRole: "Consultant Gastroenterologist",
    status: "final",
    summary:
      "Seen in gastro clinic for assessment of functional dyspepsia. History of recurrent epigastric discomfort and bloating over 4 months. No red flag symptoms. Examination unremarkable. Plan: trial of omeprazole 20mg OD, dietary modification advice given, food diary requested. Follow-up in 3 weeks to review response.",
  },
  {
    id: "letter-2",
    title: "GP referral letter — gastroenterology",
    date: "2026-02-25",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    status: "final",
    summary:
      "Referral for specialist assessment. Patient reports 4-month history of intermittent epigastric pain, worse after meals, associated with bloating. No weight loss, dysphagia or GI bleeding. Tried antacids with partial relief. PMH: nil significant. Requesting gastroenterology opinion and further investigation as appropriate.",
  },
  {
    id: "letter-3",
    title: "Routine health review letter",
    date: "2026-01-10",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    status: "final",
    summary:
      "Annual health review completed. BP 124/78, BMI 26.2. Bloods: FBC, U&E, LFTs all within normal limits. HbA1c 38 mmol/mol (normal). Cholesterol 4.8 mmol/L. No concerns raised. Continue current management. Next review in 12 months.",
  },
];

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
  const { id, patient } = usePatientLoader();
  const navigate = useNavigate();

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate(`/patients/${id}`)}
          style={{ alignSelf: "flex-start" }}
        >
          Back to patient
        </Button>

        <Title order={2}>
          Clinical letters
          {patient?.givenName ? ` — ${patient.givenName}` : ""}
        </Title>

        {fakeLetters.map((letter) => (
          <Card key={letter.id} shadow="sm" padding="lg" radius="md" withBorder>
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
