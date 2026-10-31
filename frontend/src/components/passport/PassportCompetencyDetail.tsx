/**
 * PassportCompetencyDetail Component
 *
 * One competency in a holder's passport: its sign-offs and its logbook
 * entries, with a way to add to either. A row of the By competency view
 * opens this.
 *
 * Takes its data as props and fetches nothing, so Storybook can draw it and
 * the page can hand it what it fetched, as `PassportByCompetency` does.
 *
 * **The add buttons are left out of a read-only passport**, as on the
 * other passport pages. The page says why above it.
 *
 * @example
 * ```tsx
 * <PassportCompetencyDetail
 *   competency={{ id, name }}
 *   frameworkName="Clinical oncology registrar record…"
 *   signOffs={signOffs}
 *   logbook={logbook}
 *   canWrite
 *   onAskForSignOff={ask}
 *   onAddEntry={add}
 * />
 * ```
 */

import { Group, Stack } from "@mantine/core";
import AddButton from "@/components/button/AddButton";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  EmptyState,
  Heading,
  PageHeader,
} from "@/components/typography";
import LogbookTable from "./LogbookTable";
import SignOffList from "./SignOffList";
import type {
  CompetencyRef,
  Logbook,
  LogbookEntry,
  SignOff,
} from "@lib/passport";

export interface PassportCompetencyDetailProps {
  /** The competency this page is about */
  competency: CompetencyRef;
  /** The framework it belongs to, shown under its name */
  frameworkName?: string;
  /** Its sign-offs, newest first */
  signOffs: SignOff[];
  /** Its logbook */
  logbook: Logbook;
  /** Whether the passport accepts new records */
  canWrite: boolean;
  /** Called when "Ask for a sign-off" is pressed */
  onAskForSignOff?: () => void;
  /** Called when "Add an entry" is pressed */
  onAddEntry?: () => void;
  /** Called with a sign-off's name when it is chosen */
  onSelectSignOff?: (name: string) => void;
  /** Called with a logbook entry when it is chosen */
  onSelectEntry?: (entry: LogbookEntry) => void;
}

/**
 * PassportCompetencyDetail
 *
 * Renders the competency's name, then its sign-offs, then its logbook,
 * each with its add button above it.
 */
export default function PassportCompetencyDetail({
  competency,
  frameworkName,
  signOffs,
  logbook,
  canWrite,
  onAskForSignOff,
  onAddEntry,
  onSelectSignOff,
  onSelectEntry,
}: PassportCompetencyDetailProps) {
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <PageHeader title={competency.name} />
        {frameworkName && <BodyText c="dimmed">{frameworkName}</BodyText>}
      </Stack>

      <Stack gap="sm">
        {canWrite && (
          <Group justify="flex-end">
            <AddButton label="Ask for a sign-off" onClick={onAskForSignOff} />
          </Group>
        )}
        {signOffs.length > 0 ? (
          <SignOffList
            title="Sign-offs"
            signOffs={signOffs}
            onSelect={onSelectSignOff}
          />
        ) : (
          // `SignOffList` draws nothing for an empty list, so the section
          // says for itself that nothing has been asked for.
          <BaseCard>
            <Stack gap="md">
              <Heading>Sign-offs</Heading>
              <EmptyState>Nothing asked for yet</EmptyState>
            </Stack>
          </BaseCard>
        )}
      </Stack>

      <Stack gap="sm">
        {canWrite && (
          <Group justify="flex-end">
            <AddButton label="Add an entry" onClick={onAddEntry} />
          </Group>
        )}
        <LogbookTable
          logbook={logbook}
          competencyName="Logbook"
          onSelect={onSelectEntry}
        />
      </Stack>
    </Stack>
  );
}
