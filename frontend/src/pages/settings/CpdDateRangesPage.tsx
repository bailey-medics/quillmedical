/**
 * CPD Date Ranges Page
 *
 * Where the holder sets the dates of their appraisal years, which their
 * CPD is totalled over. The record calls these appraisal periods; the
 * page calls them date ranges, because that is what is being set.
 *
 * **As many as a career needs.** Appraisal years rarely start in June
 * and move when somebody changes post, so a short range between two
 * full ones is ordinary. Gaps are allowed; overlaps are refused by the
 * server, because an activity in two ranges would count twice.
 *
 * **Every change saves the whole list.** The server checks the list for
 * overlaps as a whole, and each save is one commit in the passport's
 * history, so a corrected or removed range is never lost.
 *
 * Under Settings rather than the passport, because it is set once a year
 * and read everywhere CPD is totalled.
 */

import { useEffect, useState } from "react";
import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import AddButton from "@/components/button/AddButton";
import AppraisalPeriodForm from "@/components/passport/AppraisalPeriodForm";
import AppraisalPeriodTable from "@/components/passport/AppraisalPeriodTable";
import { ConfirmModal } from "@/components/confirm-modal";
import ErrorState from "@/components/error-state/ErrorState";
import StateMessage from "@/components/message-cards/StateMessage";
import { IconCalendar, IconTrash } from "@/components/icons/appIcons";
import {
  fetchAppraisalPeriods,
  fetchMyPassport,
  samePeriod,
  saveAppraisalPeriods,
} from "@lib/passport";
import type { AppraisalPeriod } from "@lib/passport";

/** Where the form is: closed, adding a range, or correcting one. */
type Editing =
  | { kind: "closed" }
  | { kind: "adding" }
  | {
      kind: "editing";
      period: AppraisalPeriod;
    };

export function Component() {
  const [passportId, setPassportId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<AppraisalPeriod[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<AppraisalPeriod | null>(null);
  // False only where the server said so, as on the passport's own pages.
  const [canWrite, setCanWrite] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (cancelled) return;
        const id = detail.passport.passport_id;
        setPassportId(id);
        setCanWrite(detail.entitlement?.can_write !== false);
        return fetchAppraisalPeriods(id);
      })
      .then((result) => {
        if (!cancelled && result) {
          setPeriods(result);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your date ranges could not be loaded. Please try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function closeForm() {
    setEditing({ kind: "closed" });
    setFormError(null);
  }

  async function handleSubmit(period: AppraisalPeriod) {
    if (passportId === null) return;

    const others =
      editing.kind === "editing"
        ? periods.filter((p) => !samePeriod(p, editing.period))
        : periods;

    setSubmitting(true);
    try {
      setPeriods(await saveAppraisalPeriods(passportId, [...others, period]));
      closeForm();
    } catch (err) {
      // The server's own words: an overlap names both ranges, which is
      // more use than anything this page could say.
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : "That date range could not be saved. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (passportId === null || removing === null) return;

    try {
      setPeriods(
        await saveAppraisalPeriods(
          passportId,
          periods.filter((p) => !samePeriod(p, removing)),
        ),
      );
      setError(null);
    } catch {
      setError("That date range could not be removed. Please try again.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title="CPD date ranges" />

      {error && <ErrorState message={error} />}

      {editing.kind === "closed" ? (
        <Group justify="flex-end">
          <AddButton
            label="Add a date range"
            onClick={() => setEditing({ kind: "adding" })}
            disabled={!canWrite || !loaded}
          />
        </Group>
      ) : (
        <AppraisalPeriodForm
          // A fresh form for each range, so editing one after another
          // does not keep the first one's dates.
          key={
            editing.kind === "editing"
              ? `${editing.period.starts_on}-${editing.period.ends_on}`
              : "new"
          }
          initial={editing.kind === "editing" ? editing.period : undefined}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          isSubmitting={submitting}
          error={formError}
        />
      )}

      {loaded && periods.length === 0 && (
        <StateMessage
          colour="update"
          icon={<IconCalendar />}
          title="No date ranges yet"
          description="Until you add one, your CPD is totalled June to June. Add the dates of your appraisal year so the totals match it."
        />
      )}

      {(!loaded || periods.length > 0) && !error && (
        <AppraisalPeriodTable
          periods={periods}
          isLoading={!loaded}
          onEdit={
            canWrite
              ? (period) => {
                  setFormError(null);
                  setEditing({ kind: "editing", period });
                }
              : undefined
          }
          onRemove={canWrite ? setRemoving : undefined}
        />
      )}

      <ConfirmModal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        onAccept={handleRemove}
        title="Remove this date range"
        acceptLabel="Remove"
        icon={<IconTrash />}
      >
        CPD in this range will no longer be totalled over it. The range stays in
        your passport&apos;s history.
      </ConfirmModal>
    </Stack>
  );
}
