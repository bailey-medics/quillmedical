/**
 * FHIR Patient Utilities
 *
 * Helper functions for working with FHIR R4 Patient resources.
 */

interface FhirExtension {
  url?: string;
  valueInteger?: number;
  valueString?: string;
  extension?: FhirExtension[];
}

interface FhirPatient {
  extension?: FhirExtension[];
  [key: string]: unknown;
}

const AVATAR_GRADIENT_EXTENSION_URL = "urn:quillmedical:avatar-gradient";

/**
 * Extract avatar gradient index from FHIR Patient extension.
 *
 * Looks for the `urn:quillmedical:avatar-gradient` extension with a
 * valueInteger field containing the gradient index (0-29).
 *
 * @param fhirPatient - FHIR R4 Patient resource
 * @returns Gradient index (0-29) if found, undefined otherwise
 *
 * @example
 * ```ts
 * const gradientIndex = extractAvatarGradientIndex(fhirPatient);
 * if (gradientIndex !== undefined) {
 *   console.log(gradientIndex); // 5
 * }
 * ```
 */
export function extractAvatarGradientIndex(
  fhirPatient: FhirPatient,
): number | undefined {
  if (!fhirPatient?.extension) {
    return undefined;
  }

  const avatarExt = fhirPatient.extension.find(
    (ext) => ext.url === AVATAR_GRADIENT_EXTENSION_URL,
  );

  if (avatarExt?.valueInteger !== undefined) {
    return avatarExt.valueInteger;
  }

  return undefined;
}
