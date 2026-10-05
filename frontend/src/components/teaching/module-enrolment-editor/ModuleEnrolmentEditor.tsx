/**
 * ModuleEnrolmentEditor Component
 *
 * One person's teaching enrolments, organisation by organisation: a card
 * for each organisation, its modules as tick boxes, and an optional end
 * date beside each one that is ticked.
 *
 * Controlled, and used in two places that must not drift apart: the
 * Enrolment step of the user form, which sends everything with the rest
 * of the form, and the member page, which sends each change when "Save
 * changes" is pressed. Neither saves from here.
 *
 * Composed from `BaseCard`, `CheckboxField` and `DateField`. There is
 * no table: a module has one thing to decide and one date, which reads
 * better as a row of two fields than as columns.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import CheckboxField from "@/components/form/CheckboxField";
import DateField from "@/components/form/DateField";
import { BodyText, Heading } from "@/components/typography";

export interface EnrolmentModule {
  /** The module's id, as the API names it */
  id: string;
  title: string;
}

export interface EnrolmentOrganisation {
  /** The organisation's org_unit id */
  id: number;
  name: string;
  /** The modules it serves */
  modules: EnrolmentModule[];
}

/**
 * What somebody is enrolled on: by organisation id, then module id. The
 * value is when the enrolment ends, as `YYYY-MM-DD`, or null for no end.
 * A module that is not a key is one they are not enrolled on.
 */
export type EnrolmentByOrganisation = Record<
  number,
  Record<string, string | null>
>;

export interface ModuleEnrolmentEditorProps {
  /** The organisations to show, each with the modules it serves */
  organisations: EnrolmentOrganisation[];
  /** What is ticked, and each tick's end date */
  value: EnrolmentByOrganisation;
  /** Called with the whole of `value`, one thing having changed */
  onChange: (value: EnrolmentByOrganisation) => void;
  /**
   * A line to show under a module, such as why the person cannot enter
   * it yet. Nothing is shown for a module it answers undefined for.
   */
  note?: (organisationId: number, moduleId: string) => string | undefined;
  /** Holds every field still, while a save is being sent */
  disabled?: boolean;
}

/** Tomorrow, as `YYYY-MM-DD`: the earliest an enrolment may end. */
function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function ModuleEnrolmentEditor({
  organisations,
  value,
  onChange,
  note,
  disabled = false,
}: ModuleEnrolmentEditorProps) {
  function setModule(
    organisationId: number,
    moduleId: string,
    endsOn: string | null | undefined,
  ) {
    const modules = { ...(value[organisationId] ?? {}) };
    if (endsOn === undefined) {
      delete modules[moduleId];
    } else {
      modules[moduleId] = endsOn;
    }
    onChange({ ...value, [organisationId]: modules });
  }

  return (
    <Stack gap="md">
      {organisations.map((organisation) => {
        const enrolled = value[organisation.id] ?? {};
        return (
          <BaseCard key={organisation.id}>
            <Stack gap="md">
              <Heading>{organisation.name}</Heading>
              <BodyText>
                Tick each module they are to be enrolled on. An end date is
                optional: without one, the enrolment has no end.
              </BodyText>
              {organisation.modules.map((module) => {
                const isOn = module.id in enrolled;
                const noteText = note?.(organisation.id, module.id);
                return (
                  <Stack key={module.id} gap="xs">
                    <Group align="flex-end" gap="md">
                      <CheckboxField
                        label={module.title}
                        aria-label={`${module.title} at ${organisation.name}`}
                        checked={isOn}
                        disabled={disabled}
                        onChange={(event) =>
                          setModule(
                            organisation.id,
                            module.id,
                            event.currentTarget.checked
                              ? (enrolled[module.id] ?? null)
                              : undefined,
                          )
                        }
                      />
                      {isOn && (
                        <DateField
                          label="Ends"
                          aria-label={`${module.title} at ${organisation.name}: enrolment ends`}
                          value={enrolled[module.id] ?? null}
                          onChange={(date) =>
                            setModule(organisation.id, module.id, date)
                          }
                          minDate={tomorrow()}
                          clearable
                          disabled={disabled}
                        />
                      )}
                    </Group>
                    {noteText && <BodyText c="dimmed">{noteText}</BodyText>}
                  </Stack>
                );
              })}
            </Stack>
          </BaseCard>
        );
      })}
    </Stack>
  );
}
