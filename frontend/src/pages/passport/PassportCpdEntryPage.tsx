/**
 * Passport CPD Entry Page
 *
 * One continuing professional development activity, in full, with an
 * edit button that turns the card into the CPD form filled in from it.
 *
 * **An edit is a correction on the record, not a rewrite of it.** Every
 * amendment is a commit in the passport's own history, so what the
 * activity said before stays readable there. What the form does not
 * show, the competencies it counts towards, its certificate and its
 * attachments, is sent back unchanged or left alone by the server, so
 * correcting a title cannot lose them. This page was read-only until
 * 28 September 2026.
 *
 * Reads the year rather than the single entry, because the API files
 * CPD by year and has no route for one activity. The year is in the URL
 * alongside the filename, so a link can be followed cold — a page that
 * only worked when arrived at from the table would break on a refresh.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useCallback, useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import IconTextButton from "@/components/button/IconTextButton";
import CpdEntryForm from "@/components/passport/CpdEntryForm";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import { IconFileText } from "@/components/icons/appIcons";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import { amendCpdEntry, fetchCpdYear, fetchMyPassport } from "@lib/passport";
import type { CpdEntry, CpdEntryInput } from "@lib/passport";

export function Component() {
  const { year, stem } = useParams<{ year: string; stem: string }>();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [entry, setEntry] = useState<CpdEntry | null>(null);
  const [canWrite, setCanWrite] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!year || !stem) return;
      const entries = await fetchCpdYear(id, Number(year));
      const found = entries.find((item) => item.filename === stem);
      if (found) setEntry(found);
      else setMissing(true);
    },
    [year, stem],
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
          setError("That activity could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleSave(data: CpdEntryInput) {
    if (!passportId || !year || !stem || !entry) return;

    setSaving(true);
    try {
      await amendCpdEntry(passportId, Number(year), stem, {
        ...data,
        // Not on the form, so sent back as they were rather than cleared.
        competencies: entry.competencies.map((competency) => competency.id),
        certificate: entry.certificate,
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

  // Only a failed load replaces the page. A failed save keeps the
  // activity on screen, with the message above it.
  if (error && !entry) {
    return (
      <Stack gap="lg">
        <PageHeader title="Activity" />
        <ErrorState message={error} />
      </Stack>
    );
  }

  // Told apart from a failed load on purpose: a link to something that
  // is not there and a link that could not be followed mean different
  // things, and only one is worth retrying.
  if (missing) {
    return (
      <Stack gap="lg">
        <PageHeader title="Activity" />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="That activity is not here"
          description="It may have been removed, or the link may be wrong."
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={entry?.title ?? "Activity"} />

      {error && <ErrorState message={error} />}

      {entry && editing && (
        <CpdEntryForm
          initial={entry}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          isSubmitting={saving}
        />
      )}

      {entry && !editing && (
        <Group justify="flex-end">
          {/* Disabled where the server says a write would be refused,
              rather than offering a control that fails on save. */}
          <IconTextButton
            icon="pencil"
            label="Edit activity"
            onClick={() => setEditing(true)}
            disabled={!canWrite}
          />
        </Group>
      )}

      {entry && !editing && (
        <BaseCard>
          <Stack gap="xs">
            <Heading>{entry.title}</Heading>

            <BodyTextBold>
              <FormattedDate date={entry.activity_on} format="medium" />
            </BodyTextBold>

            <BodyText>{entry.activity_type}</BodyText>

            {/* Only where there are points. An activity without them is
                an ordinary one, not an incomplete record, so a line
                reading "no points" would be inventing a shortfall. */}
            {entry.points !== null && (
              <BodyText>
                {entry.points} {entry.points === 1 ? "point" : "points"}
              </BodyText>
            )}

            {entry.competencies.length > 0 && (
              <BodyText>
                Counts towards{" "}
                {entry.competencies.map((c) => c.name).join(", ")}
              </BodyText>
            )}

            {entry.notes && <BodyText>{entry.notes}</BodyText>}
          </Stack>
        </BaseCard>
      )}
    </Stack>
  );
}
