/**
 * Document Component
 *
 * Displays a single document (PDF, Word, image) with an inline viewer.
 *
 * A PDF is shown one of two ways. A desktop browser frames it in its own
 * viewer, which brings search, print, zoom and download for nothing.
 * Phones and tablets cannot do that: Chrome on Android has no viewer
 * that works in a frame, and Safari on an iPhone draws the first page
 * only. There the pages are drawn by `PdfPages`, with pdf.js.
 * `useNativePdfViewer` makes the choice, and `PdfPages` is loaded only
 * when it is chosen, so a desktop browser never downloads pdf.js.
 */

import React, { Suspense, lazy } from "react";
import {
  Box,
  Center,
  Image,
  Stack,
  Paper,
  useMantineTheme,
} from "@mantine/core";
import Heading from "@/components/typography/Heading";
import BodyText from "@/components/typography/BodyText";
import LoadingSpinner from "@/components/loading-spinner";
import { useMediaQuery } from "@mantine/hooks";
import { useNativePdfViewer } from "./useNativePdfViewer";
import classes from "./Document.module.css";

const PdfPages = lazy(() => import("./PdfPages"));

export interface DocumentProps {
  name: string;
  type: "pdf" | "word" | "image" | "other";
  url: string;
  thumbnailUrl?: string;
}

/**
 * Document component displays a single document (PDF, Word, image, etc.)
 *
 * On smaller screens (below md breakpoint) the bordered panel around the
 * document is dropped, so the document has the full width.
 */
export const Document: React.FC<DocumentProps> = ({ name, type, url }) => {
  const theme = useMantineTheme();
  const isSmallScreen = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const nativePdfViewer = useNativePdfViewer();

  const content = (innerChildren: React.ReactNode) =>
    isSmallScreen ? (
      <Stack>{innerChildren}</Stack>
    ) : (
      <Paper withBorder p="md" radius="md">
        <Stack>{innerChildren}</Stack>
      </Paper>
    );

  return content(
    <>
      <Heading>{name}</Heading>
      {type === "image" ? (
        <Image src={url} alt={name} radius="sm" />
      ) : type === "pdf" ? (
        nativePdfViewer ? (
          <Box
            component="iframe"
            src={url}
            title={name}
            className={classes.frame}
          />
        ) : (
          <Suspense
            fallback={
              <Center>
                <LoadingSpinner label={`Loading ${name}`} />
              </Center>
            }
          >
            <PdfPages name={name} url={url} />
          </Suspense>
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
    </>,
  );
};

export default Document;
