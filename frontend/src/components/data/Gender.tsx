/**
 * Gender Component
 *
 * Pure formatter — returns bare text with no wrapping element.
 * Accepts FHIR-compliant gender values from backend.
 */

import type { GenderValue } from "./Gender.types";

type GenderProps = {
  /** Gender value (male, female, unspecified) */
  gender: GenderValue | undefined | null;
  /** Display format */
  format?: "full" | "abbreviated";
};

/**
 * Gender
 *
 * Displays gender with optional abbreviation.
 *
 * @example
 * // Full format: "Male"
 * <Gender gender="male" />
 *
 * @example
 * // Abbreviated format: "M"
 * <Gender gender="male" format="abbreviated" />
 *
 * @example
 * // Unspecified: "Unspecified"
 * <Gender gender="unspecified" />
 */
export default function Gender({ gender, format = "full" }: GenderProps) {
  if (!gender || gender === "unspecified") {
    return <>Unspecified</>;
  }

  const normalized = gender.toLowerCase();

  if (format === "abbreviated") {
    const abbreviated: Record<string, string> = {
      male: "M",
      female: "F",
    };
    return <>{abbreviated[normalized] || "U"}</>;
  }

  // Full format - capitalize first letter
  const formatted = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return <>{formatted}</>;
}
