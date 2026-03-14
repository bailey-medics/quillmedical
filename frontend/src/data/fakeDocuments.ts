/**
 * Fake document data for development and demonstration.
 *
 * Stored in a dedicated data file so that it can be shared between
 * pages and stories without violating the component-only-export
 * ESLint rule (component files must only export components).
 */

import type { DocumentProps } from "@/components/documents/Document";

export interface FakeDocument extends DocumentProps {
  id: string;
}

const base = import.meta.env.BASE_URL;

export const fakeDocuments: FakeDocument[] = [
  {
    id: "1",
    name: "External clinical letter",
    type: "pdf",
    url: `${base}mock-documents/1_external_clinical_letter.pdf`,
    thumbnailUrl: `${base}mock-documents/thumbnails/1_external_clinical_letter.pdf.png`,
  },
  {
    id: "2",
    name: "Colonoscopy report",
    type: "pdf",
    url: `${base}mock-documents/2_colonoscopy_report.pdf`,
    thumbnailUrl: `${base}mock-documents/thumbnails/2_colonoscopy_report.pdf.png`,
  },
  {
    id: "3",
    name: "Blood tests",
    type: "pdf",
    url: `${base}mock-documents/3_blood_tests.pdf`,
    thumbnailUrl: `${base}mock-documents/thumbnails/3_blood_tests.pdf.png`,
  },
  {
    id: "4",
    name: "Referral letter",
    type: "pdf",
    url: `${base}mock-documents/4_referral_letter.pdf`,
    thumbnailUrl: `${base}mock-documents/thumbnails/4_referral_letter.pdf.png`,
  },
  {
    id: "5",
    name: "Patient thank you",
    type: "pdf",
    url: `${base}mock-documents/5_patient_thankyou.pdf`,
    thumbnailUrl: `${base}mock-documents/thumbnails/5_patient_thankyou.pdf.png`,
  },
];
