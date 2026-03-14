import React from "react";
import DocumentsList from "./DocumentsList";
import { DocumentProps } from "./Document";
import { VariantStack } from "@/stories/variants";

export default {
  title: "Documents/DocumentsList",
  component: DocumentsList,
};

const docs: DocumentProps[] = [
  {
    name: "External clinical letter",
    type: "pdf",
    url: "/mock-documents/1_external_clinical_letter.pdf",
    thumbnailUrl:
      "/mock-documents/thumbnails/1_external_clinical_letter.pdf.png",
  },
  {
    name: "Colonoscopy report",
    type: "pdf",
    url: "/mock-documents/2_colonoscopy_report.pdf",
    thumbnailUrl: "/mock-documents/thumbnails/2_colonoscopy_report.pdf.png",
  },
  {
    name: "Blood tests",
    type: "pdf",
    url: "/mock-documents/3_blood_tests.pdf",
    thumbnailUrl: "/mock-documents/thumbnails/3_blood_tests.pdf.png",
  },
  {
    name: "Referral letter",
    type: "pdf",
    url: "/mock-documents/4_referral_letter.pdf",
    thumbnailUrl: "/mock-documents/thumbnails/4_referral_letter.pdf.png",
  },
  {
    name: "Patient thank you",
    type: "pdf",
    url: "/mock-documents/5_patient_thankyou.pdf",
    thumbnailUrl: "/mock-documents/thumbnails/5_patient_thankyou.pdf.png",
  },
];

export const Default = () => (
  <VariantStack>
    <DocumentsList documents={docs} />
  </VariantStack>
);
