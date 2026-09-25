/**
 * Brand palette, read from shared/brand.yaml
 *
 * The one place the frontend turns the generated brand file into colours.
 * `theme.ts` takes its ramps from here, and the email mock-ups resolve
 * their theme colours here, so neither holds its own copy of a hex value.
 * The backend reads the same YAML in `backend/app/email/brand.py` and
 * resolves references the same way.
 */

import brand from "@/generated/brand.json";

export type PaletteName = "primary" | "secondary" | "grey";

export const brandPalette: Record<PaletteName, readonly string[]> = {
  primary: brand.palette.primary,
  secondary: brand.palette.secondary,
  grey: brand.palette.grey,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const REFERENCE = /^(primary|secondary|grey)\.(\d)$/;

function isPaletteName(name: string): name is PaletteName {
  return name === "primary" || name === "secondary" || name === "grey";
}

/**
 * Turn a colour from the brand file into a hex value.
 *
 * Accepts a hex value, returned as it is, or a palette reference such as
 * "primary.8". Anything else throws: a typo in the YAML must fail the
 * build, not ship an email with a missing colour.
 */
export function resolveColour(value: string): string {
  if (HEX.test(value)) {
    return value;
  }
  const match = REFERENCE.exec(value);
  if (!match || !isPaletteName(match[1])) {
    throw new Error(`Not a colour or a palette reference: "${value}"`);
  }
  const shade = brandPalette[match[1]][Number(match[2])];
  if (shade === undefined) {
    throw new Error(`No shade ${match[2]} in the ${match[1]} palette`);
  }
  return shade;
}
