/**
 * RibbonInbox Component
 *
 * The envelope as the layouts show it in the top ribbon: how many things
 * are waiting on the person signed in, and the way to the inbox page,
 * where they are listed with what was lately dealt with.
 *
 * It is there whether or not anything is waiting. An envelope that comes
 * and goes is harder to find when it matters than one that is always in
 * the same place.
 */

import { useNavigate } from "react-router-dom";
import { INBOX_PATH } from "@/lib/inbox/inbox";
import { useInbox } from "@/lib/inbox/useInbox";
import InboxButton from "./InboxButton";

export default function RibbonInbox() {
  const navigate = useNavigate();
  const waiting = useInbox();

  return (
    <InboxButton
      label="Inbox"
      count={waiting}
      onDark
      onClick={() => navigate(INBOX_PATH)}
    />
  );
}
