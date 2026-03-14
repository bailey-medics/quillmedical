import { DocumentThumbnail } from "./DocumentThumbnail";
import { VariantStack, VariantRow } from "@/stories/variants";

export default {
  title: "Documents/DocumentThumbnail",
  component: DocumentThumbnail,
};

export const Default = () => (
  <VariantStack>
    <VariantRow label="Loaded">
      <DocumentThumbnail
        src="/mock-documents/thumbnails/1_external_clinical_letter.pdf.png"
        alt="External clinical letter"
      />
    </VariantRow>
  </VariantStack>
);

export const Loading = () => (
  <VariantStack>
    <VariantRow label="Loading" horizontal={false}>
      <DocumentThumbnail src="" alt="" loading />
    </VariantRow>
  </VariantStack>
);
