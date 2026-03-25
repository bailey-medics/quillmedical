import React from "react";
import { Box, Image, Stack, Paper, useMantineTheme } from "@mantine/core";
import HeaderText from "@/components/typography/HeaderText";
import BodyText from "@/components/typography/BodyText";
import { useMediaQuery } from "@mantine/hooks";

export interface DocumentProps {
  name: string;
  type: "pdf" | "word" | "image" | "other";
  url: string;
  thumbnailUrl?: string;
}

/**
 * Document component displays a single document (PDF, Word, image, etc.)
 *
 * On smaller screens (below md breakpoint), the browser PDF toolbar is
 * hidden via URL parameters for a cleaner view.
 */
export const Document: React.FC<DocumentProps> = ({ name, type, url }) => {
  const theme = useMantineTheme();
  const isSmallScreen = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const isTouchDevice = useMediaQuery("(pointer: coarse)");

  const pdfUrl =
    type === "pdf" && isSmallScreen
      ? `${url}#toolbar=0&navpanes=0&view=FitH`
      : url;

  const Wrapper = isSmallScreen
    ? Stack
    : ({ children }: { children: React.ReactNode }) => (
        <Paper withBorder p="md" radius="md">
          <Stack>{children}</Stack>
        </Paper>
      );

  return (
    <Wrapper>
      <HeaderText>{name}</HeaderText>
      {type === "image" ? (
        <Image src={url} alt={name} radius="sm" />
      ) : type === "pdf" ? (
        isSmallScreen && isTouchDevice ? (
          <Box
            style={{
              overflow: "hidden",
              width: "100%",
              height: "calc((100vh - 200px) * 0.667)",
              minHeight: 267,
            }}
          >
            <Box
              component="iframe"
              src={pdfUrl}
              title={name}
              style={{
                width: "150%",
                height: "calc(100vh - 200px)",
                minHeight: 400,
                border: 0,
                transform: "scale(0.667)",
                transformOrigin: "top left",
              }}
            />
          </Box>
        ) : (
          <Box
            component="iframe"
            src={pdfUrl}
            title={name}
            style={{
              width: "100%",
              height: "calc(100vh - 200px)",
              minHeight: 400,
              border: 0,
            }}
          />
        )
      ) : type === "word" ? (
        <Box>
          <BodyText>Word document preview not available</BodyText>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        </Box>
      ) : (
        <Box>
          <BodyText>Document preview not available</BodyText>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        </Box>
      )}
    </Wrapper>
  );
};

export default Document;
