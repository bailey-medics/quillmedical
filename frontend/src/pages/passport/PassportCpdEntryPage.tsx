/**
 * Passport CPD Entry Page
 *
 * One continuing professional development activity, in full.
 *
 * **Read-only for now.** Amending an entry is a separate piece of work:
 * the endpoint exists, but a form that edits a record whose whole claim
 * is that it can be checked years later wants more thought than a text
 * box — what an amendment looks like in the history, and whether the
 * original stays readable, are questions this page does not answer.
 *
 * Reads the year rather than the single entry, because the API files
 * CPD by year and has no route for one activity. The year is in the URL
 * alongside the filename, so a link can be followed cold — a page that
 * only worked when arrived at from the table would break on a refresh.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import FormattedDate from "@/components/data/Date";
import { IconFileText } from "@/components/icons/appIcons";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import { fetchCpdYear, fetchMyPassport } from "@lib/passport";
import type { CpdEntry } from "@lib/passport";

export function Component() {
  const { year, stem } = useParams<{ year: string; stem: string }>();
  const [entry, setEntry] = useState<CpdEntry | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!year || !stem) return;

    let cancelled = false;

    fetchMyPassport()
      .then((detail) => fetchCpdYear(detail.passport.passport_id, Number(year)))
      .then((entries) => {
        if (cancelled) return;
        const found = entries.find((item) => item.filename === stem);
        if (found) setEntry(found);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That activity could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [year, stem]);

  if (error) {
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

      {entry && (
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
