/**
 * The rules behind choosing a passport specialty, kept apart from the
 * components so they can be tested and shared on their own.
 *
 * A specialty orders the competency picker and nothing else. Generic, the
 * empty choice, means no specialty order.
 */

/** The select option standing for Generic. Not a specialty id. */
export const GENERIC_CHOICE = "__generic__";

/** What Generic is called on screen. */
export const GENERIC_LABEL = "Generic (no specialty order)";

/**
 * The heading a specialty's common competencies sit under in the picker:
 * "common", never "required", because a list presented as the set that
 * matters becomes a syllabus.
 */
export function specialtyGroup(displayName: string): string {
  return `Common in ${displayName.toLowerCase()}`;
}

/**
 * Turns what the specialty select now holds into an answer: `null` when
 * nothing is chosen, `[]` for Generic, or the chosen ids.
 *
 * Generic and a specialty contradict each other, so whichever was picked
 * last wins: picking Generic clears the specialties, and picking a
 * specialty clears Generic.
 */
export function nextSpecialtyValue(
  previous: string[] | null,
  selected: string[],
): string[] | null {
  if (selected.length === 0) return null;

  const hadGeneric = previous !== null && previous.length === 0;
  const hasGeneric = selected.includes(GENERIC_CHOICE);

  if (hasGeneric && !hadGeneric) return [];

  return selected.filter((id) => id !== GENERIC_CHOICE);
}
