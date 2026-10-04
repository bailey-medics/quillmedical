/**
 * Feedback Detail Page
 *
 * One piece of feedback in full: the message, who sent it and from where,
 * and the operator's answer to it, a status and a comment, both of which
 * the sender sees on their own feedback page. The list shows only the
 * start of each message, and deciding what to do about one means reading
 * all of it.
 *
 * The message is never edited. The status saves when it is chosen; the
 * comment saves from its own button, since it is typed rather than picked.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Group, Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";
import FeedbackStatusBadge from "@/components/badge/FeedbackStatusBadge";
import FormattedDate from "@/components/data/Date";
import ErrorState from "@/components/error-state/ErrorState";
import SelectField from "@/components/form/SelectField";
import TextAreaField from "@/components/form/TextAreaField";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  Heading,
} from "@/components/typography";
import { describeDevice } from "@/lib/feedback/device";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  MAX_FEEDBACK_COMMENT,
  categoryLabel,
  getFeedback,
  setFeedbackComment,
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
  const [comment, setComment] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    try {
      const fetched = await getFeedback(Number(id));
      setItem(fetched);
      setComment(fetched.comment ?? "");
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

  const commentChanged = comment.trim() !== (item?.comment ?? "");

  async function saveComment() {
    if (!item || !commentChanged) return;
    setSavingComment(true);
    try {
      const saved = await setFeedbackComment(item.id, comment.trim());
      setItem(saved);
      setComment(saved.comment ?? "");
      showMessage({
        variant: "success",
        title: saved.comment ? "Comment saved" : "Comment removed",
      });
    } catch {
      // What was typed stays in the box, to be tried again.
      showMessage({ variant: "error", title: "The comment was not saved" });
    } finally {
      setSavingComment(false);
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
          <BodyText preserveLines>{item.message}</BodyText>
        </Stack>
      </BaseCard>

      <BaseCard>
        <Stack gap="md">
          <Heading>Response</Heading>
          <SelectField
            label="Status"
            data={STATUS_OPTIONS}
            value={item.status}
            onChange={(value) => void changeStatus(value)}
            disabled={saving}
            allowDeselect={false}
          />
          <TextAreaField
            label="Comment"
            description="The sender sees this beside the status on their feedback page. Add a new line for each update."
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            maxLength={MAX_FEEDBACK_COMMENT}
            autosize
            minRows={3}
            disabled={savingComment}
          />
          <ButtonPair
            acceptLabel="Save comment"
            onAccept={() => void saveComment()}
            acceptDisabled={!commentChanged}
            acceptLoading={savingComment}
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
            <Detail
              label="Device"
              value={describeDevice(item.user_agent) ?? "Not known"}
            />
            <Detail label="Screen" value={item.viewport || "Not known"} />
            <Detail label="Browser" value={item.user_agent || "Not known"} />
          </Stack>
        </Stack>
      </BaseCard>
    </Stack>
  );
}
