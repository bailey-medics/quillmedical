/**
 * Feedback Detail Page
 *
 * One piece of feedback in full: the message, who sent it and from where,
 * and its status, which an operator changes here as they deal with it.
 * The list shows only the start of each message, and deciding what to do
 * about one means reading all of it.
 *
 * The message is never edited. Only the status changes.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Group, Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FeedbackStatusBadge from "@/components/badge/FeedbackStatusBadge";
import FormattedDate from "@/components/data/Date";
import ErrorState from "@/components/error-state/ErrorState";
import SelectField from "@/components/form/SelectField";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  Heading,
} from "@/components/typography";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  categoryLabel,
  getFeedback,
  setFeedbackStatus,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback/feedbackAdmin";

const STATUS_OPTIONS = FEEDBACK_STATUSES.map((status) => ({
  value: status,
  label: FEEDBACK_STATUS_LABELS[status],
}));

function isFeedbackStatus(value: string | null): value is FeedbackStatus {
  return FEEDBACK_STATUSES.some((status) => status === value);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="xs">
      <BodyTextBold>{label}:</BodyTextBold>
      <BodyTextInline>{value}</BodyTextInline>
    </Group>
  );
}

export default function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showMessage } = usePageMessage();
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    try {
      setItem(await getFeedback(Number(id)));
    } catch {
      setError("Feedback not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      await fetchItem();
    })();
  }, [fetchItem]);

  async function changeStatus(value: string | null) {
    if (!item || !isFeedbackStatus(value) || value === item.status) return;
    setSaving(true);
    try {
      setItem(await setFeedbackStatus(item.id, value));
      showMessage({
        variant: "success",
        title: `Marked as ${FEEDBACK_STATUS_LABELS[value].toLowerCase()}`,
      });
    } catch {
      showMessage({ variant: "error", title: "The status was not changed" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={200} />
        <Skeleton height={150} />
      </Stack>
    );
  }

  if (error || !item) {
    return (
      <ErrorState
        title="Error loading feedback"
        message={error ?? "No feedback ID provided"}
      />
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Feedback" />

      <BaseCard>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Heading>Message</Heading>
            <FeedbackStatusBadge status={item.status} />
          </Group>
          <BodyText>{item.message}</BodyText>
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="md">
          <Heading>Status</Heading>
          <SelectField
            label="Status"
            data={STATUS_OPTIONS}
            value={item.status}
            onChange={(value) => void changeStatus(value)}
            disabled={saving}
            allowDeselect={false}
          />
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="md">
          <Heading>Sent from</Heading>
          <Stack gap="xs">
            <Group gap="xs">
              <BodyTextBold>Received:</BodyTextBold>
              <FormattedDate date={item.created_at} format="long" />
            </Group>
            <Detail label="From" value={item.sender ?? "Deleted user"} />
            <Detail label="About" value={categoryLabel(item.category)} />
            <Detail label="Page" value={item.route || "Not known"} />
            {item.error_name && (
              <Detail
                label="Error"
                value={
                  item.error_code
                    ? `${item.error_name} (${item.error_code})`
                    : item.error_name
                }
              />
            )}
            <Detail label="Release" value={item.release || "Not known"} />
            <Detail label="Screen" value={item.viewport || "Not known"} />
            <Detail label="Browser" value={item.user_agent || "Not known"} />
          </Stack>
        </Stack>
      </BaseCard>
    </Stack>
  );
}
