import React from "react";
import { Stack, Group } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";
import HeaderText from "@/components/typography/HeaderText";
import BaseCard from "@/components/base-card/BaseCard";
import type { DocumentProps } from "./Document";
import { DocumentThumbnail } from "./DocumentThumbnail";

export interface DocumentsListProps {
  documents: DocumentProps[];
  onSelect?: (doc: DocumentProps) => void;
}

/**
 * DocumentsList displays a list of documents with name and thumbnail
 */
export const DocumentsList: React.FC<DocumentsListProps> = ({
  documents,
  onSelect,
}) => {
  return (
    <Stack gap="md">
      {documents.map((doc) => (
        <BaseCard
          key={doc.url}
          padding="md"
          onClick={onSelect ? () => onSelect(doc) : undefined}
          style={{ cursor: onSelect ? "pointer" : undefined }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={2}>
              <HeaderText>{doc.name}</HeaderText>
              <BodyText>{doc.url.split("/").pop()}</BodyText>
            </Stack>
            {doc.thumbnailUrl ? (
              <DocumentThumbnail src={doc.thumbnailUrl} alt={doc.name} />
            ) : null}
          </Group>
        </BaseCard>
      ))}
    </Stack>
  );
};

export default DocumentsList;
