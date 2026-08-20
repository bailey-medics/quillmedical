/**
 * UpdatingBanner Component
 *
 * Full-screen blocking overlay shown briefly before a forced reload onto
 * a new app build, on the one deploy that is a genuine client-side risk
 * — a "contract-step" deploy completing a staged breaking API change
 * (see docs/docs/backend/api-compatibility.md). Routine and expand-step
 * reloads stay fully silent per item 14 and never mount this.
 *
 * Used by `ForcedReloadGate` for the API-compatibility forced-reload
 * flow, where the tab is not route-gated and mutating requests must stop
 * until the reload completes. Pure presentational — no internal timers;
 * the reload-trigger code (`ForcedReloadProvider`) controls the whole
 * show -> wait -> reload lifecycle by mounting and unmounting this
 * component. The passive in-flow strip variant this component previously
 * also rendered has been superseded by `StatusStrip`'s `updating` variant.
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { BodyTextInline } from "@/components/typography";
import { IconRefresh } from "@/components/icons/appIcons";
import classes from "./UpdatingBanner.module.css";

/**
 * Updating Banner
 *
 * Non-dismissible, full-screen overlay announcing an imminent, forced
 * reload.
 */
export default function UpdatingBanner() {
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
