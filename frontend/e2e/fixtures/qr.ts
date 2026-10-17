/**
 * Read a QR code off a page's canvas, and check what it holds.
 *
 * The two-factor setup page draws its QR code with the `qrcode` package
 * (`src/pages/TotpSetup.tsx`). This builds the same code's grid of dark
 * and light squares with the same package, from the text it should hold,
 * and reads the square at the centre of each cell off the canvas. They
 * match only if the picture an authenticator app scans holds that text.
 * No decoder is added for it: the package is already a dependency.
 */

import { expect, type Locator } from "@playwright/test";
import QRCode from "qrcode";

/** The quiet border round a code, in cells: `qrcode`'s default. */
const MARGIN = 4;

export async function expectQrCodeHolds(
  canvas: Locator,
  text: string,
): Promise<void> {
  const { modules } = QRCode.create(text, {});
  const expected: boolean[] = [];

  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      expected.push(Boolean(modules.get(row, column)));
    }
  }

  const drawn = await canvas.evaluate(
    (element, { size, margin }) => {
      if (!(element instanceof HTMLCanvasElement)) return [];
      const context = element.getContext("2d");
      if (context === null) return [];
      const scale = element.width / (size + margin * 2);
      const dark: boolean[] = [];

      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          const x = Math.floor((column + margin + 0.5) * scale);
          const y = Math.floor((row + margin + 0.5) * scale);
          dark.push(context.getImageData(x, y, 1, 1).data[0] < 128);
        }
      }

      return dark;
    },
    { size: modules.size, margin: MARGIN },
  );

  expect(drawn, "the QR code holds the address beside it").toEqual(expected);
}
