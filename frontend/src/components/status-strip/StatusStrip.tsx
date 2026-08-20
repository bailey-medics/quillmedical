/**
 * StatusStrip Component
 *
 * Consolidated status notice, replacing the previously separate
 * `OfflineStrip`, `UpdatingBanner` (passive strip variant) and
 * `UpdateFallbackBanner` components, which had converged on the same
 * shape (icon + short message, `role="status"`, `aria-live="polite"`).
 *
 * Always rendered in normal layout flow directly below `TopRibbon` —
 * never fixed/overlay positioned. Non-dismissible: this is status
 * information, not a flash message, and stays visible until its
 * underlying condition clears. When more than one condition is true at
 * once, each is its own `StatusStrip` instance and they stack vertically
 * in the order mounted, with no priority ordering between them.
 *
 * Responsive: below `theme.breakpoints.sm`, a strip only switches to a
 * compact horizontal badge (icon + short label only) when `multiple`
 * other strips are also showing at once — so two or three simultaneous
 * strips stay usable on a phone screen, but a single strip always stays
 * full-width, even on mobile.
 */

import type { ReactElement } from "react";
import { Group, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import Icon from "@/components/icons";
import { BodyTextInline } from "@/components/typography";
import {
  IconAlertTriangle,
  IconRefresh,
  IconWifi,
  IconWifiOff,
} from "@/components/icons/appIcons";
import classes from "./StatusStrip.module.css";

export type StatusStripVariant =
  | "offline"
  | "reconnected"
  | "updating"
  | "fallback";

export interface StatusStripProps {
  /** Which status condition this strip represents. */
  variant: StatusStripVariant;
  /** Time of the last successful sync — used in the offline variant's message. */
  lastSyncedAt?: Date;
  /**
   * Whether more than one StatusStrip is rendering at the same time.
   * Only when this is true does the strip switch to the compact badge
   * layout on narrow screens — a lone strip always stays full-width, even
   * on mobile. Defaults to false.
   */
  multiple?: boolean;
}

interface VariantContent {
  icon: ReactElement;
  colour?: string;
  message: string;
  badgeLabel: string;
}

function formatLastSynced(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getVariantContent(
  variant: StatusStripVariant,
  lastSyncedAt?: Date,
): VariantContent {
  switch (variant) {
    case "offline":
      return {
        icon: <IconWifiOff />,
        message: lastSyncedAt
          ? `Offline \u2014 last synced at ${formatLastSynced(lastSyncedAt)}`
          : "Offline",
        badgeLabel: "Offline",
      };
    case "reconnected":
      return {
        icon: <IconWifi />,
        colour: "var(--success-color)",
        message: "Reconnected",
        badgeLabel: "Reconnected",
      };
    case "updating":
      return {
        icon: <IconRefresh />,
        colour: "var(--info-color)",
        message: "Updating to the latest version\u2026",
        badgeLabel: "Updating",
      };
    case "fallback":
      return {
        icon: <IconAlertTriangle />,
        colour: "var(--warning-color)",
        message:
          "An update is available but couldn't be applied automatically. Retrying in the background\u2026",
        badgeLabel: "Update pending",
      };
  }
}

/**
 * Status Strip
 *
 * Renders a single status condition as a full-width strip, or — only on
 * narrow screens when `multiple` other strips are also showing — a
 * compact badge. Consumers render one instance per active condition;
 * multiple instances stack naturally in normal layout flow.
 */
export default function StatusStrip({
  variant,
  lastSyncedAt,
  multiple = false,
}: StatusStripProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const showBadge = isMobile && multiple;
  const { icon, colour, message, badgeLabel } = getVariantContent(
    variant,
    lastSyncedAt,
  );

  if (showBadge) {
    return (
      <div
        className={classes.badge}
        role="status"
        aria-live="polite"
        data-testid="status-strip"
        data-variant={variant}
      >
        <Group gap={4} wrap="nowrap">
          <Icon icon={icon} size="sm" colour={colour} />
          <BodyTextInline c={colour}>{badgeLabel}</BodyTextInline>
        </Group>
      </div>
    );
  }

  return (
    <div
      className={classes.strip}
      role="status"
      aria-live="polite"
      data-testid="status-strip"
      data-variant={variant}
    >
      <Group gap="xs" justify="center" wrap="nowrap">
        <Icon icon={icon} size="sm" colour={colour} />
        <BodyTextInline c={colour}>{message}</BodyTextInline>
      </Group>
    </div>
  );
}
