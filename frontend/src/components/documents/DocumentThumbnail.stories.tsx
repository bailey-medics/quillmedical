import { DocumentThumbnail } from "./DocumentThumbnail";

export default {
  title: "Documents/DocumentThumbnail",
  component: DocumentThumbnail,
};

export const Default = () => (
  <DocumentThumbnail
    src="/mock-documents/thumbnails/1_external_clinical_letter.pdf.png"
    alt="External clinical letter"
  />
);

export const Loading = () => <DocumentThumbnail src="" alt="" loading />;
