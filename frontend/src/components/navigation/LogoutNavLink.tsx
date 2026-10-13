/**
 * LogoutNavLink Component
 *
 * The `Logout` entry in both sidebars. An action, not a destination.
 *
 * Signing out can fail: no network, or the server not answering. The
 * session cookies are then still in the browser, so the next person to
 * use it would be signed in as the last. So a failure is said here,
 * beneath the link, and the sidebar is left open on it: `onNavigate`,
 * which closes the drawer on a phone, is called only once the server
 * has ended the session.
 *
 * Owns that handling so the main sidebar and the teaching sidebar cannot
 * drift apart.
 */

import { NavLink } from "@mantine/core";
import { useState } from "react";
import NavIcon from "@/components/icons/NavIcon";
import LiveStatus from "@/components/live-status";
import ErrorMessage from "@/components/typography/ErrorMessage";
import { navLinkStyles } from "@/components/navigation/navStyles";

export const SIGN_OUT_FAILED =
  "Could not sign you out. Check your connection and try again.";

export interface LogoutNavLinkProps {
  /**
   * Ends the session. Rejects when it could not be ended, which is
   * `logout` from `useAuth`.
   */
  onLogout: () => Promise<void>;
  /** Whether to show the icon beside the label (defaults to true) */
  showIcons?: boolean;
  /** Called once signed out (to close the drawer) */
  onNavigate?: () => void;
}

export default function LogoutNavLink({
  onLogout,
  showIcons = true,
  onNavigate,
}: LogoutNavLinkProps) {
  const [failed, setFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    // A disabled link is only greyed out by its styles, so a second
    // press is turned away here.
    if (signingOut) return;

    setFailed(false);
    setSigningOut(true);
    try {
      await onLogout();
    } catch {
      setFailed(true);
      setSigningOut(false);
      return;
    }

    setSigningOut(false);
    onNavigate?.();
  }

  return (
    <>
      <NavLink
        label="Logout"
        description={
          failed ? <ErrorMessage>{SIGN_OUT_FAILED}</ErrorMessage> : undefined
        }
        disabled={signingOut}
        styles={navLinkStyles}
        onClick={() => void signOut()}
        leftSection={showIcons ? <NavIcon name="logout" /> : undefined}
      />
      <LiveStatus message={failed ? SIGN_OUT_FAILED : ""} />
    </>
  );
}
