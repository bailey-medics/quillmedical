/**
 * Organisation Records Kept Page
 *
 * Where an operator sets how many months one organisation's training
 * records are kept after somebody's account is closed. Once that has
 * passed, the nightly retention run lists the records for a decision.
 *
 * Operator-only: the period is the sponsor's instruction to Quill, and
 * shortening it brings records up for deletion sooner, so it is not one
 * of the organisation's own settings. The route guard hides the page;
 * the API refuses the data.
 *
 * Changing it deletes nothing.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import ErrorState from "@/components/error-state/ErrorState";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import TextField from "@/components/form/TextField";
import PageHeader from "@/components/page-header";
import { BodyText } from "@/components/typography";
import {
  MOST_MONTHS_KEPT,
  getRecordsKept,
  periodInWords,
  setRecordsKept,
  type RecordsKept,
} from "@/lib/retention/recordsKept";

interface PeriodFormValues {
  /** As typed. Empty means no period. */
  months: string;
}

const OUT_OF_RANGE = `Give whole months, from 1 to ${MOST_MONTHS_KEPT}, or leave it empty`;

/** The months that were typed: a number, null for empty, or not valid. */
function monthsTyped(text: string): number | null | "invalid" {
  const typed = text.trim();

  if (typed === "") return null;
  if (!/^\d+$/.test(typed)) return "invalid";

  const months = Number(typed);

  return months >= 1 && months <= MOST_MONTHS_KEPT ? months : "invalid";
}

function PeriodFields({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { methods } = useFormContext();

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="md">
          <TextField
            label="Months kept after an account is closed"
            description="Leave empty for no period. This organisation's records are then never listed for deletion."
            placeholder="e.g. 42"
            inputMode="numeric"
            {...methods.register("months", {
              validate: (value: string) =>
                monthsTyped(value) !== "invalid" || OUT_OF_RANGE,
            })}
            error={methods.formState.errors.months?.message as string}
          />

          <BodyText>
            Changing this deletes nothing. Once the period has passed, a closed
            account&apos;s training records here are listed on the record
            retention page, and each still needs a decision.
          </BodyText>

          <SubmitButton
            onCancel={() => navigate(`/admin/organisations/${orgId}`)}
          />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function OrgRecordsKeptPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kept, setKept] = useState<RecordsKept | null>(null);

  useEffect(() => {
    async function fetchPeriod() {
      if (!id) {
        setLoadError("No organisation ID provided");
        setLoading(false);
        return;
      }

      try {
        setKept(await getRecordsKept(Number(id)));
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load the period",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchPeriod();
  }, [id]);

  async function handleSubmit(
    data: PeriodFormValues,
  ): Promise<FormSubmitResult> {
    const months = monthsTyped(data.months);

    // The field's own rule has refused this already.
    if (months === "invalid") {
      return {
        state: "error",
        message: { title: "Period not saved", description: OUT_OF_RANGE },
      };
    }

    try {
      const saved = await setRecordsKept(Number(id), months);
      setKept(saved);

      return {
        state: "success",
        message: {
          title: "Record retention updated",
          description: `Kept after an account is closed: ${periodInWords(saved.months).toLowerCase()}`,
        },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Period not saved",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (loadError || kept === null) {
    return (
      <ErrorState
        title="Error loading record retention"
        message={loadError ?? "Failed to load the period"}
      />
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title={`Record retention: ${kept.organisation}`} />

      <Form<PeriodFormValues>
        defaultValues={{
          months: kept.months === null ? "" : String(kept.months),
        }}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <PeriodFields orgId={id!} />
      </Form>
    </Stack>
  );
}
