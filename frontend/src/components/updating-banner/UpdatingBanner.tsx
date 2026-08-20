/**
 * UpdatingBanner Component
 *
 * Thin horizontal strip shown briefly before a forced reload onto a new
 * app build, on the one deploy that is a genuine client-side risk — a
 * "contract-step" deploy completing a staged breaking API change (see
 * docs/docs/backend/api-compatibility.md). Routine and expand-step
 * reloads stay fully silent per item 14 and never mount this.
 *
 * Pure presentational — no internal timers or dismiss control. The
 * reload-trigger code controls the whole show -> wait -> reload
 * lifecycle by mounting and unmounting this component.
 *
 * The `blocking` variant is a full-screen overlay used by
 * `ForcedReloadGate` for the API-compatibility forced-reload flow, where
 * the tab is not route-gated and mutating requests must stop until the
 * reload completes — unlike the default strip, it's not mounted inside a
 * page layout, so it can't rely on being in normal layout flow.
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { BodyTextInline } from "@/components/typography";
import { IconRefresh } from "@/components/icons/appIcons";
import classes from "./UpdatingBanner.module.css";

export interface UpdatingBannerProps {
  /** Renders as a full-screen blocking overlay instead of the passive strip. */
  blocking?: boolean;
}

/**
 * Updating Banner
 *
 * Non-dismissible status strip (or, with `blocking`, a full-screen
 * overlay) announcing an imminent, forced reload.
 */
export default function UpdatingBanner({
  blocking = false,
}: UpdatingBannerProps) {
  if (blocking) {
    return (
      <div
        className={classes.overlay}
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        data-testid="updating-banner-blocking"
      >
        <Group gap="xs" justify="center" wrap="nowrap">
          <Icon icon={<IconRefresh />} size="md" colour="var(--info-color)" />
          <BodyTextInline c="var(--info-color)">
            Updating to the latest version…
          </BodyTextInline>
        </Group>
      </div>
    );
  }

  return (
    <div
      className={classes.strip}
      role="status"
      aria-live="polite"
      data-testid="updating-banner"
    >
      <Group gap="xs" justify="center" wrap="nowrap">
        <Icon icon={<IconRefresh />} size="sm" colour="var(--info-color)" />
        <BodyTextInline c="var(--info-color)">
          Updating to the latest version…
        </BodyTextInline>
      </Group>
    </div>
  );
}
