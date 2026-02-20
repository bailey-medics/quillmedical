/**
 * ActiveStatus Badge Component
 *
 * Displays the active/inactive status of a resource (patient, user, etc.)
 * with appropriate colour coding and sizing.
 */

import { Badge } from "@mantine/core";

type Props = {
  /** Whether the resource is active */
  active: boolean;
  /** Badge size (default: "md") */
  size?: "sm" | "md" | "lg" | "xl";
};

/**
 * ActiveStatus Badge
 *
 * Shows "Active" in green or "Deactivated" in red based on the active prop.
 * Larger than default badges for better visibility in admin tables.
 *
 * @example
 * ```tsx
 * <ActiveStatus active={true} />  // Shows green "Active"
 * <ActiveStatus active={false} /> // Shows red "Deactivated"
 * ```
 */
export default function ActiveStatus({ active, size = "md" }: Props) {
  return (
    <Badge color={active ? "green" : "red"} variant="light" size={size}>
      {active ? "Active" : "Deactivated"}
    </Badge>
  );
}
