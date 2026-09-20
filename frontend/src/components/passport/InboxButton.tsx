/**
 * InboxButton Component
 *
 * The way into the assessor's queue: what other people have asked this
 * person to sign off, with how many are waiting.
 *
 * **The count is the point.** A bare icon tells a holder nothing about
 * whether anybody is waiting on them, so they would have to click to
 * find out and would mostly stop bothering. A request that nobody
 * notices is worse than one that was never made: the person who asked
 * is waiting on an answer that is not coming.
 *
 * The badge follows `FilterSelect`, which is where the app already puts
 * a number beside an icon button — same offsets, same cap at "9+", so
 * the two read as one idea. Above nine the exact figure stops mattering:
 * what a reader does about eleven and about forty is the same.
 *
 * Nothing is drawn when the queue is empty. A zero is a fact nobody
 * needs and it makes an idle button look like it wants attention.
 *
 * @example
 * ```tsx
 * <InboxButton count={3} onClick={() => navigate("/passport/inbox")} />
 * ```
 */

import { ActionIcon } from "@mantine/core";
import Icon from "@/components/icons";
import { IconMail } from "@/components/icons/appIcons";
import { BodyText } from "@/components/typography";
import classes from "./InboxButton.module.css";

export interface InboxButtonProps {
  /** How many sign-off requests are waiting on this person. */
  count?: number;
  /** Called when the button is pressed. */
  onClick: () => void;
}

export default function InboxButton({ count = 0, onClick }: InboxButtonProps) {
  // The label carries the count so a screen reader gets what the badge
  // shows visually, and says whose work it is: these are other people's
  // records waiting on this person, not their own sign-offs.
  const label =
    count > 0
      ? `Sign-off requests for me to assess (${count} waiting)`
      : "Sign-off requests for me to assess";

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
        aria-label={label}
      >
        <Icon icon={<IconMail />} size="mlg" />
      </ActionIcon>
      {count > 0 && (
        <span className={classes.count} data-testid="inbox-count">
          <BodyText>{count >= 10 ? "9+" : count}</BodyText>
        </span>
      )}
    </div>
  );
}
