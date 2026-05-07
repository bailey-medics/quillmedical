import React from "react";
import { Skeleton, Stack, Group } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";
import Heading from "@/components/typography/Heading";
import BaseCard from "@/components/base-card/BaseCard";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconFileText } from "@/components/icons/appIcons";
import type { DocumentProps } from "./Document";
import { DocumentThumbnail } from "./DocumentThumbnail";

export interface DocumentsListProps {
  documents: DocumentProps[];
  onSelect?: (doc: DocumentProps) => void;
  /** Show skeleton placeholders while loading */
  loading?: boolean;
}

function DocumentSkeleton() {
  return (
    <BaseCard>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Stack gap={20} style={{ flex: 1 }}>
          <Skeleton height={26} width="60%" />
          <Skeleton height={18} width="50%" />
        </Stack>
        <DocumentThumbnail src="" alt="" loading />
      </Group>
    </BaseCard>
  );
}

/**
 * DocumentsList displays a list of documents with name and thumbnail
 */
export const DocumentsList: React.FC<DocumentsListProps> = ({
  documents,
  onSelect,
  loading = false,
}) => {
  if (loading) {
    return (
      <Stack gap="md">
        {Array.from({ length: 3 }).map((_, i) => (
          <DocumentSkeleton key={i} />
        ))}
      </Stack>
    );
  }

  if (documents.length === 0) {
    return (
      <StateMessage
        icon={<IconFileText />}
        title="No documents to show"
        description="There are no documents for this patient yet."
        colour="warning"
      />
    );
  }

  return (
    <Stack gap="md">
      {documents.map((doc) => (
        <BaseCard
          key={doc.url}
          onClick={onSelect ? () => onSelect(doc) : undefined}
          style={{ cursor: onSelect ? "pointer" : undefined }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Stack gap={2}>
              <Heading>{doc.name}</Heading>
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
