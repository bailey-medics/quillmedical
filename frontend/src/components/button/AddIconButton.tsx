/**
 * AddIconButton Component
 *
 * An icon-only add control for the row above a table, beside its search
 * and filter icons: `DataTableControlled`'s `action` slot. Subtle and
 * primary so it sits with the filter icon rather than shouting over it.
 *
 * The label is required because the button shows only an icon: without
 * it a screen reader announces "button" and nothing else. The same words
 * show as a tooltip on hover and focus.
 *
 * @example
 * ```tsx
 * <DataTableControlled
 *   action={<AddIconButton aria-label="Add hazard" onClick={add} />}
 *   ...
 * />
 * ```
 */

import type { MouseEventHandler } from "react";
import IconButton from "@/components/button/IconButton";
import AppTooltip from "@/components/tooltip/AppTooltip";
import { IconFilePlus } from "@/components/icons/appIcons";

interface AddIconButtonProps {
  /** What the button adds, read out by screen readers: "Add hazard" */
  "aria-label": string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}

export default function AddIconButton({
  "aria-label": label,
  onClick,
  disabled = false,
}: AddIconButtonProps) {
  // The same words as the aria-label, so sighted users get the hint
  // a screen reader user already has.
  return (
    <AppTooltip label={label} position="bottom">
      <IconButton
        icon={<IconFilePlus />}
        variant="subtle"
        color="primary"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
      />
    </AppTooltip>
  );
}
