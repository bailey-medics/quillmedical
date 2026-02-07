/**
 * Gender Component
 *
 * Displays gender/sex with consistent formatting.
 * Accepts FHIR-compliant gender values from backend.
 */

import { Text, type TextProps } from "@mantine/core";
import type { GenderValue } from "./Gender.types";

type GenderProps = TextProps & {
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
export default function Gender({
  gender,
  format = "full",
  ...textProps
}: GenderProps) {
  if (!gender || gender === "unspecified") {
    return <Text {...textProps}>Unspecified</Text>;
  }

  const normalized = gender.toLowerCase();

  if (format === "abbreviated") {
    const abbreviated: Record<string, string> = {
      male: "M",
      female: "F",
    };
    return <Text {...textProps}>{abbreviated[normalized] || "U"}</Text>;
  }

  // Full format - capitalize first letter
  const formatted = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return <Text {...textProps}>{formatted}</Text>;
}
