/**
 * FailIcon Component
 *
 * Atomic fail/error indicator — red circle with a white cross.
 * Uses the alert status colour for consistency across the app.
 */

import { IconX } from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import { badgeColours } from "./badgeColours";

interface FailIconProps {
  /** Icon size (default: "sm") */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export default function FailIcon({ size = "sm" }: FailIconProps) {
  return (
    <Icon
      icon={<IconX />}
      size={size}
      container={badgeColours.alert.bg}
      containerVariant="filled"
    />
  );
}
