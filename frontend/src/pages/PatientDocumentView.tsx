/**
 * Patient document view page.
 *
 * Displays a single document (PDF viewer, image, etc.) for a specific patient.
 * Currently uses fake data for demonstration purposes.
 */

import { Document } from "@/components/documents/Document";
import { fakeDocuments } from "@/data/fakeDocuments";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Container, Stack, Button, Text } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function PatientDocumentView() {
  const { id, documentId } = useParams<{ id: string; documentId: string }>();
  const { patient, setPatientNav } = usePatientLoader();
  const navigate = useNavigate();

  const doc = fakeDocuments.find((d) => d.id === documentId);

  useEffect(() => {
    if (patient && id) {
      const nav = [
        { label: patient.name, href: `/patients/${id}` },
        { label: "Documents", href: `/patients/${id}/documents` },
      ];
      if (doc) {
        nav.push({
          label: doc.name,
          href: `/patients/${id}/documents/${documentId}`,
        });
      }
      setPatientNav(nav);
    }
  }, [patient, id, documentId, doc, setPatientNav]);

  if (!doc) {
    return (
      <Container size="lg" py="xl">
        <Text c="red">Document not found.</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Button
          variant="subtle"
          onClick={() => navigate(`/patients/${id}/documents`)}
        >
          ← Back to documents
        </Button>
        <Document {...doc} />
      </Stack>
    </Container>
  );
}
