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
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { BodyTextInline } from "@/components/typography";
import { IconRefresh } from "@/components/icons/appIcons";
import classes from "./UpdatingBanner.module.css";

/**
 * Updating Banner
 *
 * Non-dismissible status strip announcing an imminent, forced reload.
 */
export default function UpdatingBanner() {
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
