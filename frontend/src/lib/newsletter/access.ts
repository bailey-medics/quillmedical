/**
 * Who may use the Newsletter section of the admin area.
 *
 * The one place the frontend says so: the route guard and the menu both
 * read it. For now it is an operator of Quill itself, since a
 * newsletter belongs to no one organisation. When somebody is to look
 * after newsletters and nothing else, this becomes a competency check,
 * as the backend's `MAY_USE_NEWSLETTER` does, and nothing else changes.
 */

import type { User } from "@/auth/AuthContext";

/** Whether this person may use the Newsletter section. */
export function mayUseNewsletter(
  user: Pick<User, "platform_role"> | null | undefined,
): boolean {
  return user?.platform_role === "superadmin";
}
