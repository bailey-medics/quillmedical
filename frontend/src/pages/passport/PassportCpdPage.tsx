/**
 * Passport CPD Page
 *
 * The holder's continuing professional development activities, totalled
 * over one of their CPD date ranges at a time.
 *
 * **The ranges are the holder's own**, the `appraisal_periods` they set
 * on the CPD date ranges page, because appraisal years rarely start in
 * January or June and move when somebody changes post. With none set,
 * the page falls back to June to June years, and the table says that is
 * a convention rather than their actual cycle.
 *
 * **Nothing falls through a gap.** An activity between two ranges, or
 * from before the first, is in none of them, so a final option lists
 * those, shown only when there are any.
 *
 * The API files CPD by calendar year, which no range respects, so the
 * page asks for every activity at once and sorts them into ranges here.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import { SelectField } from "@components/form";
import CpdEntryForm from "@/components/passport/CpdEntryForm";
import CpdTable from "@/components/passport/CpdTable";
import ErrorState from "@/components/error-state/ErrorState";
import {
  addCpdEntry,
  fetchAllCpd,
  fetchAppraisalPeriods,
  fetchMyPassport,
  juneToJuneYears,
  labelPeriods,
  newestFirst,
  periodContains,
  periodKey,
} from "@lib/passport";
import type { AppraisalPeriod, CpdEntry, CpdEntryInput } from "@lib/passport";

/** The select value for activities outside every declared range. */
const OUTSIDE = "outside";

/** Today as an ISO date, in the holder's own timezone. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The select value for the range holding `isoDate`, if one does. */
function rangeHolding(ranges: AppraisalPeriod[], isoDate: string) {
  const found = ranges.find((range) => periodContains(range, isoDate));
  return found ? periodKey(found) : null;
}

export function Component() {
  const navigate = useNavigate();
  const [passportId, setPassportId] = useState<string | null>(null);
  const [declared, setDeclared] = useState<AppraisalPeriod[]>([]);
  const [entries, setEntries] = useState<CpdEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Read from the passport this page already fetches. False only where
  // the server said so, so a response built before the field existed
  // still offers the button.
  const [canWrite, setCanWrite] = useState(true);

  // Declared ranges when there are any, otherwise June to June years
  // reaching back to the oldest activity. Newest first either way.
  const convention = declared.length === 0;
  const ranges = useMemo(
    () =>
      convention
        ? juneToJuneYears(todayIso(), entries[0]?.activity_on)
        : newestFirst(declared),
    [convention, declared, entries],
  );

  const outside = useMemo(
    () =>
      convention
        ? []
        : entries.filter(
            (entry) =>
              !declared.some((range) =>
                periodContains(range, entry.activity_on),
              ),
          ),
    [convention, declared, entries],
  );

  const options = useMemo(() => {
    const labels = labelPeriods(ranges);
    const listed = ranges.map((range) => ({
      value: periodKey(range),
      label: labels.get(periodKey(range)) ?? periodKey(range),
    }));
    return outside.length > 0
      ? [...listed, { value: OUTSIDE, label: "Outside your date ranges" }]
      : listed;
  }, [ranges, outside]);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return Promise.all([fetchAppraisalPeriods(id), fetchAllCpd(id)]);
      })
      .then((result) => {
        if (cancelled || !result) return;
        const [periods, all] = result;
        setDeclared(periods);
        setEntries(all);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your CPD could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The holder's choice while it is still an option; otherwise the
  // range holding today, or the newest if none does. Derived rather
  // than set in an effect, so the select and the table never disagree
  // for a render.
  const current =
    selected !== null && options.some((option) => option.value === selected)
      ? selected
      : loading
        ? null
        : (rangeHolding(ranges, todayIso()) ?? options[0]?.value ?? null);

  const selectedRange =
    current === OUTSIDE
      ? undefined
      : ranges.find((range) => periodKey(range) === current);

  const shown =
    current === OUTSIDE
      ? outside
      : selectedRange
        ? entries.filter((entry) =>
            periodContains(selectedRange, entry.activity_on),
          )
        : [];

  async function handleSubmit(data: CpdEntryInput) {
    if (passportId === null) return;

    setSubmitting(true);
    try {
      await addCpdEntry(passportId, data);
      setEntries(await fetchAllCpd(passportId));

      // Show the range the new activity falls in, so it is in view
      // rather than apparently lost in another one. Worked out from the
      // activity's date rather than from `ranges`, which a new oldest
      // activity is about to extend.
      setSelected(
        convention
          ? periodKey(juneToJuneYears(data.activity_on, undefined, 1)[0])
          : (rangeHolding(declared, data.activity_on) ?? OUTSIDE),
      );

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

      {/* Below the add button, as every passport section has its
          filter: adding comes first on each of them. */}
      <SelectField
        label="Date range"
        data={options}
        value={current}
        onChange={(value) => value && setSelected(value)}
        disabled={loading}
      />

      {/* Clicking an activity opens it in full. The year is in the
          URL alongside the filename, so the link can be followed cold
          rather than only from this table. */}
      <CpdTable
        entries={shown}
        period={selectedRange}
        convention={convention}
        isLoading={loading}
        onSelect={(entry) =>
          navigate(`/passport/cpd/${entry.year}/${entry.filename}`)
        }
      />
    </Stack>
  );
}
