/**
 * CompetencyPicker Component
 *
 * Chooses a competency: the ones commonly used here first, then every
 * other competency beneath, all of them searchable.
 *
 * **The shortlist suggests and never restricts.** An oncology centre
 * needs its competencies to hand rather than making somebody search a
 * few thousand definitions — but the moment a list is presented as the
 * set that matters, it becomes a syllabus the software is asserting.
 * So nothing is hidden and nothing is refused: the shortlist is a
 * convenience heading, and every competency stays reachable.
 *
 * **The wording matters as much as the behaviour.** The heading reads
 * "Commonly used here" rather than "Required" or "Available", because
 * the second and third would quietly turn a convenience list into a
 * syllabus — which is the sufficiency judgement the passport refuses to
 * make.
 *
 * **The catalogue comes from the generated bundle, for now.** There is
 * no endpoint serving competency definitions; `GET
 * /api/passport/competencies` is described in the plan but was never
 * built, so this reads `src/generated/competencies.json` like the admin
 * pages do. The plan already lists replacing that with an endpoint as a
 * deferred item, because every competency ever defined currently ships
 * to every browser.
 *
 * @example
 * ```tsx
 * <CompetencyPicker
 *   value={competencyId}
 *   onChange={setCompetencyId}
 *   commonlyUsedHere={["perform_bronchoscopy"]}
 * />
 * ```
 */

import { useMemo } from "react";
import { SelectField } from "@components/form";
import { ACTIVE_COMPETENCIES } from "@/types/cbac";

/** One competency, as the generated catalogue holds it. */
interface CatalogueEntry {
  id: string;
  display_name: string;
}

/**
 * The heading a site's curated competencies appear under. Exported so a
 * test can assert the wording: "Required" or "Available" would assert
 * something the passport deliberately does not.
 */
export const SHORTLIST_GROUP = "Commonly used here";

/** The heading everything else appears under. */
export const EVERYTHING_ELSE_GROUP = "All competencies";

export interface CompetencyPickerProps {
  /** The chosen competency id, or null */
  value: string | null;
  /** Called with the chosen competency id */
  onChange: (competencyId: string | null) => void;
  /**
   * Competency ids a site or organisation curates as commonly used.
   * Interface furniture only: nothing here gates what may be chosen.
   */
  commonlyUsedHere?: string[];
  /** Field label */
  label?: string;
  /** Helper text below the field */
  description?: string;
  /** Validation message */
  error?: string;
  /** Whether a competency must be chosen */
  required?: boolean;
  /** Disables the field */
  disabled?: boolean;
}

export default function CompetencyPicker({
  value,
  onChange,
  commonlyUsedHere = [],
  label = "Competency",
  description,
  error,
  required = false,
  disabled = false,
}: CompetencyPickerProps) {
  const data = useMemo(() => {
    // Current only: a retired competency cannot be signed off
    // against, and the API refuses it at the write boundary.
    const catalogue = ACTIVE_COMPETENCIES as CatalogueEntry[];
    const shortlisted = new Set(commonlyUsedHere);

    const toOption = (entry: CatalogueEntry) => ({
      value: entry.id,
      label: entry.display_name,
    });

    // The shortlist keeps the order the site curated. Everything else is
    // alphabetical, since no other order means anything to a reader.
    const shortlist = commonlyUsedHere
      .map((id) => catalogue.find((entry) => entry.id === id))
      .filter((entry): entry is CatalogueEntry => entry !== undefined)
      .map(toOption);

    const rest = catalogue
      .filter((entry) => !shortlisted.has(entry.id))
      .map(toOption)
      .sort((a, b) => a.label.localeCompare(b.label));

    // Without a shortlist there is nothing to distinguish, so one flat
    // list reads better than a group of one.
    if (shortlist.length === 0) return rest;

    return [
      { group: SHORTLIST_GROUP, items: shortlist },
      { group: EVERYTHING_ELSE_GROUP, items: rest },
    ];
  }, [commonlyUsedHere]);

  return (
    <SelectField
      label={label}
      description={description}
      error={error}
      placeholder="Search competencies"
      data={data}
      value={value}
      onChange={onChange}
      searchable
      nothingFoundMessage="No competency found"
      required={required}
      disabled={disabled}
    />
  );
}
