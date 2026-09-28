/**
 * Passport Logbook Entry Page
 *
 * One logged procedure in full, reached by choosing it in the logbook,
 * with an edit button that turns the same card into the logbook form
 * filled in from the entry.
 *
 * Read from the competency's logbook rather than a route of its own, as
 * the CPD activity page reads its year: the list already carries every
 * field, and one more endpoint would be one more thing to keep in step.
 *
 * Editing corrects the record; it does not re-date or re-file it. What
 * the form does not show, the competencies the entry also counts towards
 * and its attachments, is sent back unchanged or left alone by the
 * server, so correcting a date cannot lose them.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import LogbookEntryForm from "@/components/passport/LogbookEntryForm";
import { IconFileText } from "@/components/icons/appIcons";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import competenciesData from "@/generated/competencies.json";
import {
  amendLogbookEntry,
  fetchLogbook,
  fetchMyPassport,
} from "@lib/passport";
import type {
  CompetencyState,
  LogbookEntry,
  LogbookEntryInput,
} from "@lib/passport";

/** The competency's display name, from the shared catalogue. */
function competencyName(competencyId: string): string {
  const catalogue = competenciesData.competencies as {
    id: string;
    display_name: string;
  }[];
  return (
    catalogue.find((item) => item.id === competencyId)?.display_name ??
    competencyId
  );
}

/** What the logbook form needs to name the competency it is editing. */
function competencyForForm(competencyId: string): CompetencyState {
  return {
    id: competencyId,
    name: competencyName(competencyId),
    status: "requested",
    level: null,
    signed_on: null,
    signed_off_by: null,
    expires_on: null,
    sign_off: null,
    previous_sign_offs: [],
    logbook_entries: 0,
    certificates: [],
  };
}

/** One labelled fact, shown only where the holder recorded it. */
function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <Stack gap={2}>
      <BodyTextBold>{label}</BodyTextBold>
      <BodyText>{value}</BodyText>
    </Stack>
  );
}

export function Component() {
  const { competencyId, stem } = useParams<{
    competencyId: string;
    stem: string;
  }>();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [entry, setEntry] = useState<LogbookEntry | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!competencyId || !stem) return;
      const logbook = await fetchLogbook(id, competencyId);
      const found = logbook.entries.find((item) => item.filename === stem);
      if (found) setEntry(found);
      else setMissing(true);
    },
    [competencyId, stem],
  );

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return load(id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That entry could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleSave(data: LogbookEntryInput) {
    if (!passportId || !competencyId || !stem || !entry) return;

    setSaving(true);
    try {
      await amendLogbookEntry(passportId, competencyId, stem, {
        ...data,
        // Not on the form, so sent back as it was rather than cleared.
        also_counts_towards: entry.also_counts_towards,
      });
      await load(passportId);
      setEditing(false);
      setError(null);
    } catch {
      setError("Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const title = competencyId ? competencyName(competencyId) : "Logbook entry";

  if (missing) {
    return (
      <Stack gap="lg">
        <PageHeader title="Logbook entry" />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="That entry is not here"
          description="It may have been removed, or the link may be wrong."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={title} />

      {error && <ErrorState message={error} />}

      {entry && competencyId && editing && (
        <LogbookEntryForm
          competency={competencyForForm(competencyId)}
          initial={entry}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          isSubmitting={saving}
        />
      )}

      {entry && !editing && (
        <>
          <Group justify="flex-end">
            {/* Disabled where the server says a write would be refused,
                rather than offering a control that fails on save. */}
            <IconTextButton
              icon="pencil"
              label="Edit entry"
              onClick={() => setEditing(true)}
              disabled={!canWrite}
            />
          </Group>

          <BaseCard>
            <Stack gap="md">
              <Heading>
                <FormattedDate date={entry.performed_on} format="medium" />
              </Heading>
              <Detail label="Setting" value={entry.setting} />
              <Detail
                label="Supervision"
                value={
                  entry.supervision === "supervised"
                    ? "Supervised"
                    : entry.supervision === "independent"
                      ? "Independent"
                      : null
                }
              />
              <Detail label="Supervisor" value={entry.supervisor} />
              <Detail label="Indication" value={entry.indication} />
              <Detail label="Outcome" value={entry.outcome} />
              <Detail label="Notes" value={entry.notes} />
            </Stack>
          </BaseCard>
        </>
      )}
    </Stack>
  );
}
