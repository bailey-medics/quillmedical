/**
 * useNativePdfViewer
 *
 * Whether this browser can be trusted to show a whole PDF inside a page
 * with its own viewer. `Document` frames the file when it can, and draws
 * the pages itself with `PdfPages` when it cannot.
 *
 * True only when both hold:
 *
 * - `navigator.pdfViewerEnabled` is true: the browser says it has a
 *   viewer. Chrome on Android says no, which is right.
 * - The main pointer is a mouse (`pointer: fine`). Safari on an iPhone
 *   says it has a viewer and then draws the first page only, with no way
 *   to scroll to the rest, so its word alone is not enough.
 *
 * No device is named. An iPad announces itself as a Mac, so matching on
 * names would miss it, where the pointer check does not.
 *
 * A wrong "no" costs little: `PdfPages` shows the PDF in any browser. A
 * wrong "yes" shows a broken frame, so anything unsure answers "no",
 * including an older browser that does not report a viewer at all.
 */

import { useMediaQuery } from "@mantine/hooks";

export function useNativePdfViewer(): boolean {
  // Read at once, not after the first render. Starting from "no" would
  // have every desktop browser begin loading pdf.js and then drop it.
  const hasMouse = useMediaQuery("(pointer: fine)", false, {
    getInitialValueInEffect: false,
  });

  return hasMouse && navigator.pdfViewerEnabled === true;
}

export default useNativePdfViewer;
