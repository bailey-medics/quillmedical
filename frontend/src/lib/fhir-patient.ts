/**
 * FHIR Patient Utilities
 *
 * Helper functions for working with FHIR R4 Patient resources.
 */

export interface AvatarGradient {
  colorFrom: string;
  colorTo: string;
}

interface FhirExtension {
  url?: string;
  valueString?: string;
  extension?: FhirExtension[];
}

interface FhirPatient {
  extension?: FhirExtension[];
  [key: string]: unknown;
}

const AVATAR_GRADIENT_EXTENSION_URL = "urn:quillmedical:avatar-gradient";

/**
 * Extract avatar gradient colors from FHIR Patient extension.
 *
 * Looks for the `urn:quillmedical:avatar-gradient` extension with nested
 * colorFrom and colorTo extensions.
 *
 * @param fhirPatient - FHIR R4 Patient resource
 * @returns Gradient colors if found, null otherwise
 *
 * @example
 * ```ts
 * const gradient = extractAvatarGradient(fhirPatient);
 * if (gradient) {
 *   console.log(gradient.colorFrom); // "#FF6B6B"
 *   console.log(gradient.colorTo);   // "#4ECDC4"
 * }
 * ```
 */
export function extractAvatarGradient(
  fhirPatient: FhirPatient,
): AvatarGradient | null {
  if (!fhirPatient?.extension) {
    return null;
  }

  const avatarExt = fhirPatient.extension.find(
    (ext) => ext.url === AVATAR_GRADIENT_EXTENSION_URL,
  );

  if (!avatarExt?.extension) {
    return null;
  }

  const colorFromExt = avatarExt.extension.find(
    (ext) => ext.url === "colorFrom",
  );
  const colorToExt = avatarExt.extension.find((ext) => ext.url === "colorTo");

  if (colorFromExt?.valueString && colorToExt?.valueString) {
    return {
      colorFrom: colorFromExt.valueString,
      colorTo: colorToExt.valueString,
    };
  }

  return null;
}
