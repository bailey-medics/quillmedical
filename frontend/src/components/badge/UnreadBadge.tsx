/**
 * Unread Badge Component
 *
 * Displays an unread message count as a filled circular badge.
 * Renders nothing when the count is zero or less.
 */

import classes from "./UnreadBadge.module.css";

type Props = {
  /** Number of unread messages */
  count: number;
  /** Badge size (default: "lg") */
  size?: "sm" | "md" | "lg" | "xl";
};

/**
 * Unread Badge
 *
 * Shows a filled circular badge with the unread count.
 * Returns null when there are no unread messages.
 *
 * @example
 * ```tsx
 * <UnreadBadge count={3} />       // Shows blue circle with "3"
 * <UnreadBadge count={0} />       // Renders nothing
 * <UnreadBadge count={12} />      // Shows "9+"
 * ```
 */
export default function UnreadBadge({ count, size = "lg" }: Props) {
  if (count <= 0) return null;

  const label = count > 9 ? "9+" : String(count);

  return (
    <span
      className={`${classes.badge} ${classes[size]}`}
      aria-label={`${count} unread`}
    >
      {label}
    </span>
  );
}
