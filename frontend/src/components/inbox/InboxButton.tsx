/**
 * InboxButton Component
 *
 * An envelope with how many things are waiting behind it. It began as
 * the way into the passport assessor's queue and is shared now, so that
 * everything waiting on somebody is shown the same way. `label` says
 * what this one counts.
 *
 * **The count is the point.** A bare icon tells a holder nothing about
 * whether anybody is waiting on them, so they would have to click to
 * find out and would mostly stop bothering. A request that nobody
 * notices is worse than one that was never made: the person who asked
 * is waiting on an answer that is not coming.
 *
 * The badge follows `FilterSelect`, which is where the app already puts
 * a number beside an icon button - same offsets, same cap at "9+", so
 * the two read as one idea. Above nine the exact figure stops mattering:
 * what a reader does about eleven and about forty is the same.
 *
 * The envelope turns amber, the brand's secondary colour, while
 * anything is waiting, and stays the default colour otherwise.
 *
 * Nothing is drawn when the queue is empty. A zero is a fact nobody
 * needs and it makes an idle button look like it wants attention.
 *
 * `onDark` is for the top ribbon, which is navy. The idle envelope is
 * grey 6 there, so that it sits back in the ribbon while nothing is
 * waiting. White drew the eye, and a blue from the navy ramp looked
 * muddy. Grey 6 is about 5.3:1 against the navy: an icon that is the
 * whole control needs 3:1 (WCAG 1.4.11), and the darkest grey that
 * meets it, `#666666`, all but vanishes on a phone in daylight. The
 * count is white, and the button sits level with the ribbon's other
 * controls, not nudged to a heading's baseline.
 *
 * It passes its ref and any other props to the button itself, so it can
 * be the target of a Mantine `Menu`, which adds the press handler and
 * the `aria-expanded` state that way.
 *
 * @example
 * ```tsx
 * <InboxButton
 *   label="Sign-off requests for me to assess"
 *   count={3}
 *   onClick={() => navigate("/inbox")}
 * />
 * ```
 */

import type { ComponentPropsWithRef } from "react";
import { ActionIcon } from "@mantine/core";
import Icon from "@/components/icons";
import { IconMail } from "@/components/icons/appIcons";
import { BodyText } from "@/components/typography";
import classes from "./InboxButton.module.css";

/** The idle envelope on navy: quiet, and well clear of 3:1 against it. */
const IDLE_ON_DARK = "var(--mantine-color-gray-6)";

export interface InboxButtonProps extends Omit<
  ComponentPropsWithRef<"button">,
  "color" | "children"
> {
  /**
   * What is behind the envelope, as a screen reader says it: "Sign-off
   * requests for me to assess". The count is added to it.
   */
  label: string;
  /** How many things are waiting on this person. */
  count?: number;
  /** Draw it for a dark background, such as the top ribbon. */
  onDark?: boolean;
}

export default function InboxButton({
  label,
  count = 0,
  onDark = false,
  ref,
  ...others
}: InboxButtonProps) {
  // The name carries the count so a screen reader gets what the badge
  // shows visually.
  const name = count > 0 ? `${label} (${count} waiting)` : label;
  // Amber while anything is waiting, so the envelope itself signals
  // work and not just the number beside it.
  const waitingColour = count > 0 ? "var(--brand-secondary)" : undefined;

  return (
    <div className={onDark ? classes.triggerOnDark : classes.trigger}>
      {/* `mlg`, the step for an icon that is the whole control: big
          enough to press and notice, small enough not to compete with
          what the page is for. */}
      <ActionIcon
        {...others}
        ref={ref}
        variant={onDark ? "transparent" : "subtle"}
        color="primary"
        className={classes.button}
        aria-label={name}
      >
        <Icon
          icon={<IconMail />}
          size="mlg"
          colour={waitingColour ?? (onDark ? IDLE_ON_DARK : undefined)}
        />
      </ActionIcon>
      {count > 0 && (
        <span
          className={onDark ? classes.countOnDark : classes.count}
          data-testid="inbox-count"
        >
          <BodyText c={onDark ? "white" : undefined}>
            {count >= 10 ? "9+" : count}
          </BodyText>
        </span>
      )}
    </div>
  );
}
