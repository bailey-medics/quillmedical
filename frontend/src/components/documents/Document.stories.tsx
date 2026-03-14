import React from "react";
import { Document } from "./Document";

export default {
  title: "Documents/Document",
  component: Document,
};

export const PDF = () => (
  <Document
    name="External clinical letter"
    type="pdf"
    url="/mock-documents/1_external_clinical_letter.pdf"
  />
);
