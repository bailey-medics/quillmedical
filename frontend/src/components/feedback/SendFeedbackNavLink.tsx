/**
 * SendFeedbackNavLink Component
 *
 * The `Send feedback` entry in both sidebars. An action rather than a
 * destination: it opens `FeedbackModal` over whatever is on screen and does
 * not navigate, so the thing being described stays visible behind it.
 *
 * Ungated. Everybody can hit a bug, and a learner spotting a factual error
 * in a case is the report most worth having.
 *
 * Owns its own modal, so the main sidebar and the teaching sidebar cannot
 * drift apart. It deliberately does not call `onNavigate`: on mobile that
 * closes the navigation drawer, which unmounts the drawer's contents and
 * would take the modal with it.
 */

import { NavLink } from "@mantine/core";
import { useState } from "react";
import NavIcon from "@/components/icons/NavIcon";
import { navLinkStyles } from "@/components/navigation/navStyles";
import { sendFeedback } from "@/lib/feedback/sendFeedback";
import FeedbackModal from "./FeedbackModal";

export interface SendFeedbackNavLinkProps {
  /** Whether to show the icon beside the label (defaults to true) */
  showIcons?: boolean;
}

export default function SendFeedbackNavLink({
  showIcons = true,
}: SendFeedbackNavLinkProps) {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <NavLink
        label="Send feedback"
        styles={navLinkStyles}
        onClick={() => setOpened(true)}
        leftSection={showIcons ? <NavIcon name="feedback" /> : undefined}
      />
      <FeedbackModal
        opened={opened}
        onClose={() => setOpened(false)}
        onSubmit={sendFeedback}
      />
    </>
  );
}
