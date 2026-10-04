/**
 * Opening a PDF with pdf.js
 *
 * The one place pdf.js is set up, so its worker and its options are
 * decided once. Used by `PdfPages`, which draws a PDF on the devices
 * whose browsers cannot show one inside a page.
 *
 * Everything pdf.js loads comes from this origin, because the
 * application's content security policy (`caddy/prod/Caddyfile`) is
 * `script-src 'self'`:
 *
 * - The worker is bundled by Vite and referred to by its built URL. A
 *   worker from a CDN or a `blob:` URL would be refused.
 * - The decoders for JBIG2 and JPEG 2000 images, which scanned letters
 *   use, are the plain JavaScript ones (`useWasm: false`). The
 *   WebAssembly ones are faster, but compiling WebAssembly needs
 *   `'wasm-unsafe-eval'` in the policy, and a slower scan is a better
 *   trade than a looser policy. `pdfjsDecoders` in `vite.config.ts`
 *   serves them under `pdfjs/`.
 */

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "@lib/api";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Where `pdfjsDecoders` in `vite.config.ts` puts the image decoders. */
const DECODER_URL = `${import.meta.env.BASE_URL}pdfjs/`;

const API_PREFIX = "/api";

/**
 * Starts opening the PDF at `url`.
 *
 * A file from the API is fetched with `api.blob` and handed over as
 * bytes, so a lapsed access token is refreshed and the request retried
 * as it is for every other call. Left to fetch the URL itself, pdf.js
 * would simply fail on the 401. Anything else, a file served beside the
 * application, is left to pdf.js.
 *
 * @param url - Where the PDF is, as `Document` is given it
 * @returns The pdf.js loading task: await `promise`, and call `destroy`
 *   when the document is no longer wanted
 */
export async function openPdf(url: string): Promise<PDFDocumentLoadingTask> {
  const options = { useWasm: false, wasmUrl: DECODER_URL };

  if (url.startsWith(`${API_PREFIX}/`)) {
    const blob = await api.blob(url.slice(API_PREFIX.length));
    const data = new Uint8Array(await blob.arrayBuffer());
    return getDocument({ ...options, data });
  }

  return getDocument({ ...options, url });
}
