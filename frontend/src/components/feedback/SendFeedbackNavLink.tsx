/**
 * SendFeedbackNavLink Component
 *
 * The `Feedback` entry in both sidebars. An action rather than a
 * destination, whatever the noun suggests: it opens `FeedbackModal` over whatever is on screen and does
 * not navigate, so the thing being described stays visible behind it.
 *
 * Ungated. Everybody can hit a bug, and a learner spotting a factual error
 * in a case is the report most worth having.
 *
 * Owns its own modal, so the main sidebar and the teaching sidebar cannot
 * drift apart. It deliberately does not call `onNavigate`: on mobile that
 * closes the navigation drawer, which unmounts the drawer's contents and
 * would take the modal with it.
 *
 * While the sender is on their own feedback page, a `Your feedback` child
 * hangs beneath it, the way the other sidebar entries grow a child for the
 * page that is open. It is not there otherwise: that page is reached from
 * the modal, and a permanent child would make the action look like a
 * destination.
 */

import { NavLink } from "@mantine/core";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import NavIcon from "@/components/icons/NavIcon";
import NestedNavLink from "@/components/navigation/NestedNavLink";
import { navLinkStyles } from "@/components/navigation/navStyles";
import { YOUR_FEEDBACK_PATH } from "@/lib/feedback/myFeedback";
import { sendFeedback } from "@/lib/feedback/sendFeedback";
import FeedbackModal from "./FeedbackModal";

export interface SendFeedbackNavLinkProps {
  /** Whether to show the icon beside the label (defaults to true) */
  showIcons?: boolean;
  /** Called after following the `Your feedback` child (to close the drawer) */
  onNavigate?: () => void;
}

export default function SendFeedbackNavLink({
  showIcons = true,
  onNavigate,
}: SendFeedbackNavLinkProps) {
  const [opened, setOpened] = useState(false);
  const onYourFeedback = useLocation().pathname === YOUR_FEEDBACK_PATH;

  return (
    <>
      <NavLink
        label="Feedback"
        styles={navLinkStyles}
        onClick={() => setOpened(true)}
        leftSection={showIcons ? <NavIcon name="feedback" /> : undefined}
      />
      {onYourFeedback && (
        <NestedNavLink
          item={{ label: "Your feedback", href: YOUR_FEEDBACK_PATH }}
          onNavigate={onNavigate}
          showIcons={showIcons}
          level={1}
        />
      )}
      <FeedbackModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSubmit={sendFeedback}
      />
    </>
  );
}
