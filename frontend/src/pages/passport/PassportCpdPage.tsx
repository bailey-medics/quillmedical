/**
 * Passport CPD Page
 *
 * A year's continuing professional development activities.
 *
 * The year is chosen here and passed to the API, which files entries by
 * year on disk. The declared appraisal period is not yet served by the
 * API — `appraisal_periods` is a recorded decision without an
 * implementation — so `CpdTable` falls back to naming its convention.
 */

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { SelectField } from "@components/form";
import CpdTable from "@/components/passport/CpdTable";
import ErrorState from "@/components/error-state/ErrorState";
import { fetchCpdYear, fetchMyPassport } from "@lib/passport";
import type { CpdEntry } from "@lib/passport";

/** The current year and the four before it, newest first. */
function recentYears(): { value: string; label: string }[] {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, offset) => {
    const year = thisYear - offset;
    return { value: String(year), label: String(year) };
  });
}

export function Component() {
  const [passportId, setPassportId] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [entries, setEntries] = useState<CpdEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setPassportId(detail.passport.passport_id);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your passport could not be loaded. Please try again.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (passportId === null) return;

    let cancelled = false;

    fetchCpdYear(passportId, Number(year))
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) {
          setError("That year could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [passportId, year]);

  return (
    <Stack gap="lg">
      <PageHeader title="Continuing professional development" />

      {error && <ErrorState message={error} />}

      <SelectField
        label="Year"
        data={recentYears()}
        value={year}
        onChange={(value) => value && setYear(value)}
      />

      <CpdTable entries={entries} isLoading={loading} />
    </Stack>
  );
}
