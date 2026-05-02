/**
 * PassIcon Component
 *
 * Atomic pass/success indicator — teal circle with a white tick.
 * Uses the success status colour for consistency across the app.
 */

import { IconCheck } from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import { badgeColours } from "./badgeColours";

interface PassIconProps {
  /** Icon size (default: "sm") */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export default function PassIcon({ size = "sm" }: PassIconProps) {
  return (
    <Icon
      icon={<IconCheck />}
      size={size}
      container={badgeColours.success.bg}
      containerVariant="filled"
    />
  );
}
