/**
 * Patient document view page.
 *
 * Displays a single document (PDF viewer, image, etc.) for a specific patient.
 * Currently uses fake data for demonstration purposes.
 */

import { Document } from "@/components/documents/Document";
import { fakeDocuments } from "@/data/fakeDocuments";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { ErrorMessage } from "@/components/typography";
import { Container } from "@mantine/core";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

export default function PatientDocumentView() {
  const { id, documentId } = useParams<{ id: string; documentId: string }>();
  const { patient, setPatientNav } = usePatientLoader();

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
        <ErrorMessage>Document not found.</ErrorMessage>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Document {...doc} />
    </Container>
  );
}
