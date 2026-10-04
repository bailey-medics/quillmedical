/**
 * PdfPages Component
 *
 * Draws a PDF as a column of pages, one canvas each, with pdf.js. For
 * the browsers that cannot show a PDF inside a page: Chrome on Android
 * has no viewer that works in a frame, and Safari on an iPhone draws the
 * first page only. `Document` chooses between this and the browser's own
 * viewer; a desktop browser keeps its own and never loads this file.
 *
 * A page is drawn only as it nears the screen, and its canvas holds the
 * page's shape until then, so a long letter costs a phone nothing until
 * it is scrolled to.
 *
 * The pages are pictures: a screen reader hears "Page 2 of 5" and no
 * more, and nothing can be selected or searched. "Open file" above the
 * pages hands the file to the device's own PDF reader, which does all
 * three, and is also the way to save or print.
 */

import { useEffect, useRef, useState } from "react";
import { Box, Center, Group, Stack } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import IconTextButton from "@/components/button/IconTextButton";
import ErrorState from "@/components/error-state/ErrorState";
import LoadingSpinner from "@/components/loading-spinner";
import BodyText from "@/components/typography/BodyText";
import { openPdf } from "@lib/pdf/openPdf";
import classes from "./PdfPages.module.css";

export interface PdfPagesProps {
  /** What the file is called, for the labels a screen reader hears */
  name: string;
  /** Where the PDF is, as `Document` is given it */
  url: string;
}

/** A page's size in PDF points, before any scaling. */
interface PageSize {
  width: number;
  height: number;
}

/** What came of opening the file at `url`. */
type Opened =
  | { url: string; pdf: PDFDocumentProxy; sizes: PageSize[] }
  | { url: string; pdf: null };

/**
 * How many canvas pixels to draw per CSS pixel. The screen's own ratio,
 * so text is sharp, but no more than two: a phone reporting three would
 * hold over thirty megabytes for each A4 page, for a difference nobody
 * can see at reading distance.
 */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  /** Page number, counting from one */
  number: number;
  /** How many pages the document has */
  total: number;
  size: PageSize;
  /** Width of the column in CSS pixels, or 0 before it is measured */
  width: number;
}

function PdfPage({ pdf, number, total, size, width }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A browser without IntersectionObserver draws every page at once,
  // which is slower and still shows the document.
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || near) return;

    // A screen's height of margin above and below, so a page is drawn
    // before it is scrolled to rather than as it arrives.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !near) return;

    let cancelled = false;
    const drawing: { task: RenderTask | null } = { task: null };

    (async () => {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;

        const cssWidth = width > 0 ? width : size.width;
        const viewport = page.getViewport({
          scale: (cssWidth * pixelRatio()) / size.width,
        });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        drawing.task = page.render({ canvas, viewport });
        await drawing.task.promise;
      } catch {
        // Cancelling a draw rejects it too, which is not a failure.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      drawing.task?.cancel();
    };
  }, [pdf, number, near, width, size.width]);

  return (
    <Box>
      <canvas
        ref={canvasRef}
        className={classes.page}
        role="img"
        aria-label={`Page ${number} of ${total}`}
        width={Math.round(size.width)}
        height={Math.round(size.height)}
      />
      {failed && <BodyText>Page {number} could not be shown.</BodyText>}
    </Box>
  );
}

/**
 * Shows the PDF at `url` as a column of pages.
 *
 * @param props - Component props
 * @returns The pages, a spinner while the file opens, or an error with
 *   a way to open the file elsewhere
 */
export default function PdfPages({ name, url }: PdfPagesProps) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const { ref, width } = useElementSize<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    const loading: { task: PDFDocumentLoadingTask | null } = { task: null };

    (async () => {
      try {
        const task = await openPdf(url);
        loading.task = task;
        if (cancelled) {
          void task.destroy();
          return;
        }

        const pdf = await task.promise;
        const sizes: PageSize[] = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1 });
          sizes.push({ width: viewport.width, height: viewport.height });
        }
        if (!cancelled) setOpened({ url, pdf, sizes });
      } catch {
        if (!cancelled) setOpened({ url, pdf: null });
      }
    })();

    // Destroying the task stops the worker and frees its copy of the
    // document, and cancels any page still being drawn from it.
    return () => {
      cancelled = true;
      void loading.task?.destroy();
    };
  }, [url]);

  function openFile() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // What was opened belongs to an earlier `url` until the new one lands.
  const current = opened?.url === url ? opened : null;

  if (current && current.pdf === null) {
    return (
      <ErrorState
        title="This file could not be shown"
        message="You can open it in your device's own PDF reader instead."
        action={{ label: "Open file", icon: "download", onClick: openFile }}
      />
    );
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <IconTextButton
          icon="download"
          label="Open file"
          aria-label={`Open file: ${name}`}
          variant="outline"
          onClick={openFile}
        />
      </Group>

      {current ? (
        <Box ref={ref} className={classes.pages}>
          {current.sizes.map((size, index) => (
            <PdfPage
              key={index}
              pdf={current.pdf}
              number={index + 1}
              total={current.sizes.length}
              size={size}
              width={Math.round(width)}
            />
          ))}
        </Box>
      ) : (
        <Center>
          <LoadingSpinner label={`Loading ${name}`} />
        </Center>
      )}
    </Stack>
  );
}
