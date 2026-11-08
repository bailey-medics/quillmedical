/**
 * Read the text of a PDF the browser saved, as a person reads it on
 * opening the file.
 *
 * Uses pdf.js, which the app already depends on to show PDFs, through
 * its legacy build, the one that runs in Node rather than a browser.
 */

import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Every page's text in the PDF at *path*, joined with no spaces at all.
 *
 * A long word such as a fingerprint can be wrapped across two lines on
 * the page, and pdf.js hands back each line on its own, so spaces and
 * line ends are taken out and a test looks for what it expects with
 * none in it either.
 */
export async function textOfPdf(path: string): Promise<string> {
  const data = new Uint8Array(fs.readFileSync(path));
  const loading = getDocument({ data });
  const document = await loading.promise;
  const pages: string[] = [];

  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) pages.push(item.str);
    }
  }

  await loading.destroy();

  return pages.join("").replace(/\s+/g, "");
}
