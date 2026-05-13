/**
 * OfflineStrip Component
 *
 * Thin horizontal strip rendered below the TopRibbon header when the
 * app is offline or has just reconnected. White background with dark
 * grey text. Pushes content down (not an overlay).
 *
 * Pure presentational — visibility and state controlled by parent.
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { BodyTextInline } from "@/components/typography";
import { IconWifi, IconWifiOff } from "@/components/icons/appIcons";
import classes from "./OfflineStrip.module.css";

export type OfflineStripState = "offline" | "reconnected";

export interface OfflineStripProps {
  /** Current connectivity state */
  state: OfflineStripState;
  /** Timestamp of last successful API call */
  lastSyncedAt: Date;
}

function formatLastSynced(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Offline Strip
 *
 * Renders a status strip with connectivity information.
 * - offline: wifi-off icon, "No connection" message, last synced time
 * - reconnected: wifi icon, "Reconnected" confirmation
 */
export default function OfflineStrip({
  state,
  lastSyncedAt,
}: OfflineStripProps) {
  const isReconnected = state === "reconnected";

  return (
    <div
      className={`${classes.strip} ${isReconnected ? classes.reconnected : classes.offline}`}
      role="status"
      aria-live="polite"
      data-testid="offline-strip"
    >
      <Group gap="xs" justify="center" wrap="nowrap">
        <Icon
          icon={isReconnected ? <IconWifi /> : <IconWifiOff />}
          size="sm"
          colour={
            isReconnected ? "var(--success-color)" : "var(--mantine-color-text)"
          }
        />
        <BodyTextInline c={isReconnected ? "var(--success-color)" : undefined}>
          {isReconnected
            ? "Reconnected"
            : `Offline \u2014 last synced at ${formatLastSynced(lastSyncedAt)}`}
        </BodyTextInline>
      </Group>
    </div>
  );
}
