/**
 * Carrying an open navigation drawer from one layout to the next.
 *
 * Each layout owns its drawer. Going from a teaching page to an admin
 * one swaps `TeachingLayout` for `MainLayout`, and the new layout
 * starts with its drawer shut, so a link that is meant to leave the
 * drawer open (`keepsDrawerOpen` on a `NavItem`) could only do so
 * within one layout. Pressing Admin from a teaching page shut it.
 *
 * So the link says so in the navigation itself, as router state, and
 * the layout that mounts on the other side reads it for where its
 * drawer starts. Router state rather than anything shared, because it
 * belongs to that one navigation: nothing is left behind to open a
 * drawer on some later, unrelated page.
 */

/** Router state a link sends to ask the next layout to open its drawer. */
export const NAV_DRAWER_OPEN_STATE = { navDrawerOpen: true } as const;

/**
 * Whether a location's state asks for the drawer to start open.
 *
 * @param state - `location.state`, which may be anything or nothing
 * @returns True only for state a `keepsDrawerOpen` link sent
 */
export function asksForOpenDrawer(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "navDrawerOpen" in state &&
    state.navDrawerOpen === true
  );
}
