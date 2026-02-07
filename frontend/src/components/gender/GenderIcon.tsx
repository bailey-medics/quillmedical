/**
 * GenderIcon Component
 *
 * Displays gender/sex icon with consistent formatting.
 */

import {
  IconGenderMale,
  IconGenderFemale,
  IconGenderAgender,
  type IconProps,
} from "@tabler/icons-react";
import { Skeleton } from "@mantine/core";
import type { GenderValue } from "./Gender.types";

type GenderIconProps = IconProps & {
  /** Gender value (male, female, unspecified) */
  gender: GenderValue | undefined | null;
  /** Loading state */
  loading?: boolean;
};

/**
 * GenderIcon
 *
 * Displays appropriate icon for gender value.
 *
 * @example
 * // Male icon
 * <GenderIcon gender="male" />
 *
 * @example
 * // With custom size and color
 * <GenderIcon gender="female" size={32} color="blue" />
 *
 * @example
 * // Unspecified
 * <GenderIcon gender="unspecified" />
 *
 * @example
 * // Loading state
 * <GenderIcon gender="male" loading />
 */
export default function GenderIcon({
  gender,
  loading,
  ...iconProps
}: GenderIconProps) {
  const iconSize = iconProps.size || 24;
  const iconColor = iconProps.color || "#495057"; // Dark grey (Mantine gray.7)

  if (loading) {
    return <Skeleton circle height={iconSize} width={iconSize} />;
  }

  if (!gender || gender === "unspecified") {
    return (
      <IconGenderAgender {...iconProps} size={iconSize} color={iconColor} />
    );
  }

  const normalized = gender.toLowerCase();

  if (normalized === "male") {
    return <IconGenderMale {...iconProps} size={iconSize} color={iconColor} />;
  }

  if (normalized === "female") {
    return (
      <IconGenderFemale {...iconProps} size={iconSize} color={iconColor} />
    );
  }

  // Fallback for any unexpected value
  return <IconGenderAgender {...iconProps} size={iconSize} color={iconColor} />;
}
