import React from "react";
import { Stack, Card, Text, Group } from "@mantine/core";
import { DocumentProps } from "./Document";
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
        <Card
          key={doc.url}
          shadow="sm"
          padding="md"
          radius="md"
          withBorder
          onClick={onSelect ? () => onSelect(doc) : undefined}
          style={{ cursor: onSelect ? "pointer" : undefined }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={2}>
              <Text fw={700} size="lg">
                {doc.name}
              </Text>
              <Text size="sm" c="dimmed">
                {doc.url.split("/").pop()}
              </Text>
            </Stack>
            {doc.thumbnailUrl ? (
              <DocumentThumbnail src={doc.thumbnailUrl} alt={doc.name} />
            ) : null}
          </Group>
        </Card>
      ))}
    </Stack>
  );
};

export default DocumentsList;
