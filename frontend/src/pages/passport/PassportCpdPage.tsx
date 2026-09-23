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
import { useNavigate } from "react-router-dom";
import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import { SelectField } from "@components/form";
import CpdEntryForm from "@/components/passport/CpdEntryForm";
import CpdTable from "@/components/passport/CpdTable";
import ErrorState from "@/components/error-state/ErrorState";
import { addCpdEntry, fetchCpdYear, fetchMyPassport } from "@lib/passport";
import type { CpdEntry, CpdEntryInput } from "@lib/passport";

/** The current year and the four before it, newest first. */
function recentYears(): { value: string; label: string }[] {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, offset) => {
    const year = thisYear - offset;
    return { value: String(year), label: String(year) };
  });
}

export function Component() {
  const navigate = useNavigate();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [entries, setEntries] = useState<CpdEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Read from the passport this page already fetches. False only where
  // the server said so, so a response built before the field existed
  // still offers the button.
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        setPassportId(detail.passport.passport_id);
        setCanWrite(detail.entitlement?.can_write !== false);
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

  async function handleSubmit(data: CpdEntryInput) {
    if (passportId === null) return;

    setSubmitting(true);
    try {
      await addCpdEntry(passportId, data);

      // The API files an entry by its own date, which need not be the
      // year on screen. Showing that year means the new entry is in
      // view rather than apparently lost — and when it matches, this is
      // simply the reload it would have been anyway.
      const filedUnder = String(new Date(data.activity_on).getFullYear());
      if (filedUnder !== year) {
        setYear(filedUnder);
      } else {
        setEntries(await fetchCpdYear(passportId, Number(year)));
      }

      setAdding(false);
      setError(null);
    } catch {
      setError("That activity could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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

      {adding ? (
        <CpdEntryForm
          onSubmit={handleSubmit}
          onCancel={() => setAdding(false)}
          isSubmitting={submitting}
        />
      ) : (
        <Group justify="flex-end">
          <AddButton
            label="Add an activity"
            onClick={() => setAdding(true)}
            disabled={!canWrite}
          />
        </Group>
      )}

      {/* Clicking an activity opens it in full. The year is in the
          URL alongside the filename, so the link can be followed cold
          rather than only from this table. */}
      <CpdTable
        entries={entries}
        isLoading={loading}
        onSelect={(entry) =>
          navigate(`/passport/cpd/${entry.year}/${entry.filename}`)
        }
      />
    </Stack>
  );
}
