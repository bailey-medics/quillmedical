import React from "react";
import { Box, Image, Text, Stack, Paper } from "@mantine/core";

export interface DocumentProps {
  name: string;
  type: "pdf" | "word" | "image" | "other";
  url: string;
  thumbnailUrl?: string;
}

/**
 * Document component displays a single document (PDF, Word, image, etc.)
 */
export const Document: React.FC<DocumentProps> = ({ name, type, url }) => {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack>
        <Text fw={700}>{name}</Text>
        {type === "image" ? (
          <Image src={url} alt={name} radius="sm" />
        ) : type === "pdf" ? (
          <Box
            component="iframe"
            src={url}
            title={name}
            style={{ width: "100%", height: 500, border: 0 }}
          />
        ) : type === "word" ? (
          <Box>
            <Text c="dimmed">Word document preview not available</Text>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </Box>
        ) : (
          <Box>
            <Text c="dimmed">Document preview not available</Text>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </Box>
        )}
      </Stack>
    </Paper>
  );
};

export default Document;
