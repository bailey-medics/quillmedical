/**
 * The choices offered for a site's clinical lead.
 *
 * A post can be vacant, so the list opens with "No clinical lead".
 * Choosing it is how a lead is stood down: the dropdown has no clear
 * button, and emptying a searchable one puts the old choice back. The
 * form itself holds null for a vacant post, so a page saves exactly as
 * it did before; only the field translates.
 */

/** The choice standing for a vacant post. Never a user id. */
export const NO_CLINICAL_LEAD = "none";

interface LeadCandidate {
  id: number;
  username: string;
  email: string;
}

/** "No clinical lead" first, then each candidate by username and email. */
export function clinicalLeadOptions(
  users: readonly LeadCandidate[],
): { value: string; label: string }[] {
  const people = users.map((u) => ({
    value: String(u.id),
    label: `${u.username} (${u.email})`,
  }));

  return [{ value: NO_CLINICAL_LEAD, label: "No clinical lead" }, ...people];
}

/** What the field shows for the form's value: a vacant post is a choice. */
export function toLeadChoice(value: string | null): string {
  return value ?? NO_CLINICAL_LEAD;
}

/** What the form keeps for the field's choice: null for a vacant post. */
export function fromLeadChoice(choice: string | null): string | null {
  if (choice === null || choice === NO_CLINICAL_LEAD) return null;

  return choice;
}
