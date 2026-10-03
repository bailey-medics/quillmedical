/**
 * The new user form's query string for somebody a lookup did not find:
 * what was typed, as the email or the username it was, and the org_unit
 * they were being added to.
 */
export function newUserSearch(term: string, orgUnitId: string): string {
  return new URLSearchParams({
    [term.includes("@") ? "email" : "username"]: term,
    org_unit: orgUnitId,
  }).toString();
}
