/**
 * UpdateFallbackBanner Component
 *
 * Dismissible fallback shown when the forced-reload flow's automatic
 * reload didn't resolve the API-compatibility mismatch (see
 * ForcedReloadGate) — e.g. deploy ordering meant the matching frontend
 * bundle wasn't live yet. Background retries keep happening regardless of
 * dismissal; this banner is purely a passive, user-dismissible notice with
 * a manual-refresh action, so the user is never stuck without a way
 * forward and is never forced into a silent reload loop.
 *
 * Fixed to the bottom of the viewport — unlike UpdatingBanner's strip
 * variant, this is not mounted inside a page layout, so it can't rely on
 * being in normal layout flow.
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { BodyTextInline } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import classes from "./UpdateFallbackBanner.module.css";

export interface UpdateFallbackBannerProps {
  /** Called when the user dismisses the banner. */
  onDismiss: () => void;
}

/**
 * Update Fallback Banner
 *
 * Tells the user an update is available but couldn't be applied
 * automatically, offering a manual refresh or dismissal.
 */
export default function UpdateFallbackBanner({
  onDismiss,
}: UpdateFallbackBannerProps) {
  return (
    <div
      className={classes.strip}
      role="status"
      aria-live="polite"
      data-testid="update-fallback-banner"
    >
      <Group gap="sm" justify="center" wrap="wrap">
        <Icon
          icon={<IconAlertTriangle />}
          size="sm"
          colour="var(--warning-color)"
        />
        <BodyTextInline c="var(--warning-color)">
          An update is available but couldn't be applied automatically. Please
          refresh manually.
        </BodyTextInline>
        <ButtonPair
          onAccept={() => window.location.reload()}
          acceptLabel="Refresh now"
          onCancel={onDismiss}
          cancelLabel="Dismiss"
          justify="center"
        />
      </Group>
    </div>
  );
}
