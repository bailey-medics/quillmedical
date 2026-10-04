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
 * a number beside an icon button – same offsets, same cap at "9+", so
 * the two read as one idea. Above nine the exact figure stops mattering:
 * what a reader does about eleven and about forty is the same.
 *
 * The envelope turns amber, the brand's secondary colour, while
 * anything is waiting, and stays the default colour otherwise.
 *
 * Nothing is drawn when the queue is empty. A zero is a fact nobody
 * needs and it makes an idle button look like it wants attention.
 *
 * @example
 * ```tsx
 * <InboxButton
 *   label="Sign-off requests for me to assess"
 *   count={3}
 *   onClick={() => navigate("/passport/inbox")}
 * />
 * ```
 */

import { ActionIcon } from "@mantine/core";
import Icon from "@/components/icons";
import { IconMail } from "@/components/icons/appIcons";
import { BodyText } from "@/components/typography";
import classes from "./InboxButton.module.css";

export interface InboxButtonProps {
  /**
   * What is behind the envelope, as a screen reader says it: "Sign-off
   * requests for me to assess". The count is added to it.
   */
  label: string;
  /** How many things are waiting on this person. */
  count?: number;
  /** Called when the button is pressed. */
  onClick: () => void;
}

export default function InboxButton({
  label,
  count = 0,
  onClick,
}: InboxButtonProps) {
  // The name carries the count so a screen reader gets what the badge
  // shows visually.
  const name = count > 0 ? `${label} (${count} waiting)` : label;

  return (
    <div className={classes.trigger}>
      {/* `mlg`, the step for an icon that is the whole control: big
          enough to press and notice, small enough not to compete with
          the action cards below, which are the page's own content. */}
      <ActionIcon
        variant="subtle"
        color="primary"
        className={classes.button}
        onClick={onClick}
        aria-label={name}
      >
        {/* Amber while anything is waiting, so the envelope itself
            signals work and not just the number beside it. */}
        <Icon
          icon={<IconMail />}
          size="mlg"
          colour={count > 0 ? "var(--brand-secondary)" : undefined}
        />
      </ActionIcon>
      {count > 0 && (
        <span className={classes.count} data-testid="inbox-count">
          <BodyText>{count >= 10 ? "9+" : count}</BodyText>
        </span>
      )}
    </div>
  );
}
