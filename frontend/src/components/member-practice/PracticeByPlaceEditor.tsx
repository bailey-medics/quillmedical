/**
 * What one person may practise, at each org_unit they belong to.
 *
 * The member practice panel answers that for one person at one org_unit.
 * This answers it for one person across all of theirs at once, which is
 * what the new and edit user form needs: somebody is put at their
 * org_units and given their competencies, and where they may use each one
 * is the last thing to settle before they can do anything at all.
 *
 * One card per org_unit, each listing the competencies the person will
 * hold with a "may practise here" switch. It is the same row the member
 * practice panel draws, from the same parts.
 *
 * Controlled, and it saves nothing: it is given the choices and reports a
 * change, and the form it sits in decides when they are sent.
 *
 * @example
 * ```tsx
 * <PracticeByPlaceEditor
 *   places={[{ id: 4, name: "Oncology", type: "hospital" }]}
 *   competencies={["certify_death"]}
 *   value={practice}
 *   onChange={setPractice}
 * />
 * ```
 */

import { useMemo } from "react";
import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import { SolidSwitch } from "@/components/form";
import type { Column } from "@/components/tables/DataTable";
import DataTableControlled from "@/components/tables/DataTableControlled";
import { BodyText, Heading } from "@/components/typography";
import { typeCanHoldCompetencies } from "@/domains/orgUnit";
import { rowsFor, type CompetencyRow } from "./competencyRows";

/** An org_unit the person belongs to, as much as the editor needs. */
export interface PracticePlace {
  id: number;
  name: string;
  /** Its type, from `shared/org-unit-types.yaml` */
  type: string;
}

/** What may be practised where: competency ids, by org_unit id. */
export type PracticeByPlace = Record<number, string[]>;

/** Props for {@link PracticeByPlaceEditor}. */
export interface PracticeByPlaceEditorProps {
  /** The org_units the person belongs to, or is being put at */
  places: PracticePlace[];
  /** The competencies they hold, or will once the form is saved */
  competencies: string[];
  /** What is switched on at each org_unit */
  value: PracticeByPlace;
  /** Called with the whole of `value`, one switch having moved */
  onChange: (value: PracticeByPlace) => void;
  /**
   * Whether the viewer may switch a competency. A switch they may not
   * move is shown disabled, never hidden: a teaching admin who saw only
   * the teaching competencies would take a clinician to hold nothing
   * else. Omitted, every switch can be moved.
   */
  mayChange?: (competency: string) => boolean;
  /** Holds every switch still, while the form is being sent */
  disabled?: boolean;
}

/**
 * A card of "may practise here" switches for each org_unit.
 *
 * @param props - Component props
 * @returns The editor
 */
export default function PracticeByPlaceEditor({
  places,
  competencies,
  value,
  onChange,
  mayChange,
  disabled = false,
}: PracticeByPlaceEditorProps) {
  const rows = useMemo(() => rowsFor(competencies), [competencies]);

  if (places.length === 0) {
    return (
      <BodyText>
        They are not at an organisation or site yet. Practice is set where
        somebody belongs, so choose one first.
      </BodyText>
    );
  }

  if (rows.length === 0) {
    return (
      <BodyText>
        They will hold no competencies, so there is nothing to authorise.
      </BodyText>
    );
  }

  function columnsFor(place: PracticePlace): Column<CompetencyRow>[] {
    const on = new Set(value[place.id] ?? []);
    return [
      {
        header: "Competency",
        render: (row) => row.name,
        accessor: (row) => row.name,
      },
      {
        header: "May practise here",
        // Wide enough to keep the header on one line.
        width: "200px",
        render: (row) => (
          <SolidSwitch
            checked={on.has(row.id)}
            disabled={disabled || (mayChange ? !mayChange(row.id) : false)}
            onChange={(event) => {
              const next = new Set(on);
              if (event.currentTarget.checked) next.add(row.id);
              else next.delete(row.id);
              onChange({ ...value, [place.id]: [...next].sort() });
            }}
            // Named with the org_unit too: the same competency has a
            // switch in every card, and a screen reader hears them all.
            aria-label={`${row.name} at ${place.name}: may practise here`}
          />
        ),
      },
    ];
  }

  return (
    <Stack gap="lg">
      {places.map((place) => (
        <BaseCard key={place.id}>
          <Stack gap="md">
            <Heading>{place.name}</Heading>
            {typeCanHoldCompetencies(place.type) ? (
              <DataTableControlled<CompetencyRow>
                data={rows}
                columns={columnsFor(place)}
                getRowKey={(row) => row.id}
                searchFields={(row) => [row.name]}
              />
            ) : (
              <BodyText>
                Nobody is authorised to practise at this kind of place, so there
                is nothing to set here.
              </BodyText>
            )}
          </Stack>
        </BaseCard>
      ))}
    </Stack>
  );
}
