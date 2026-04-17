/**
 * GenderIcon Component
 *
 * Displays gender/sex icon with consistent formatting.
 */

import {
  IconGenderMale,
  IconGenderFemale,
  IconGenderAgender,
} from "@/components/icons/appIcons";
import { Skeleton } from "@mantine/core";
import type { GenderValue } from "@/components/data/Gender.types";

const SIZES = { sm: 24, md: 29, lg: 38 } as const;
type GenderIconSize = keyof typeof SIZES;

interface GenderIconProps {
  /** Gender value (male, female, unspecified) */
  gender: GenderValue | undefined | null;
  /** Icon size */
  size?: GenderIconSize;
  /** Icon colour */
  color?: string;
  /** Loading state */
  loading?: boolean;
}

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
 * // With custom size and colour
 * <GenderIcon gender="female" size="lg" color="blue" />
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
  size = "lg",
  color = "#495057",
  loading,
}: GenderIconProps) {
  const iconSize = SIZES[size];

  if (loading) {
    return <Skeleton circle height={iconSize} width={iconSize} />;
  }

  if (!gender || gender === "unspecified") {
    return <IconGenderAgender size={iconSize} color={color} />;
  }

  const normalized = gender.toLowerCase();

  if (normalized === "male") {
    return <IconGenderMale size={iconSize} color={color} />;
  }

  if (normalized === "female") {
    return <IconGenderFemale size={iconSize} color={color} />;
  }

  // Fallback for any unexpected value
  return <IconGenderAgender size={iconSize} color={color} />;
}
