/**
 * Your Feedback Page
 *
 * Everything the signed-in user has sent through the `Feedback` link, newest
 * first, with where each has got to. This closes the loop for the sender:
 * somebody who reported a broken case can see it was fixed, and so has a
 * reason to report the next one.
 *
 * Read-only. The status is the answer, with a comment from whoever dealt
 * with it when they wrote one. The sender cannot reply to that here.
 * Reached from links in the feedback modal, not the sidebar - sending is
 * the sidebar's job, and it happens far more often than checking.
 */

import { useEffect, useState } from "react";
import { Group, Skeleton, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import FeedbackStatusBadge from "@/components/badge/FeedbackStatusBadge";
import FormattedDate from "@/components/data/Date";
import ErrorState from "@/components/error-state/ErrorState";
import PageHeader from "@/components/page-header";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  EmptyState,
} from "@/components/typography";
import { categoryLabel } from "@/lib/feedback/feedbackAdmin";
import {
  listMyFeedback,
  markRepliesSeen,
  type MyFeedbackItem,
} from "@/lib/feedback/myFeedback";
import { inboxChanged } from "@/lib/inbox/inbox";

export default function YourFeedbackPage() {
  const [items, setItems] = useState<MyFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchItems() {
      try {
        const found = await listMyFeedback();
        setItems(found);
        // Opening this page is reading every reply on it, so any that
        // were waiting on the sender stop waiting, and the envelope in
        // the ribbon is told. A failure here costs only a stale count.
        if (found.some((item) => item.comment)) {
          void markRepliesSeen()
            .then((seen) => {
              if (seen > 0) inboxChanged();
            })
            .catch(() => undefined);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    void fetchItems();
  }, []);

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </Stack>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Error loading your feedback"
        message="Your feedback could not be loaded. Please try again later."
      />
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="Your feedback" />

      {items.length === 0 ? (
        <EmptyState>
          You have not sent any feedback yet. Use Feedback in the menu whenever
          something is wrong or could be better.
        </EmptyState>
      ) : (
        items.map((item) => (
          <BaseCard key={item.id}>
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <FormattedDate date={item.created_at} format="long" />
                  {item.category && (
                    <BodyTextInline>
                      &middot; {categoryLabel(item.category)}
                    </BodyTextInline>
                  )}
                </Group>
                <FeedbackStatusBadge status={item.status} audience="sender" />
              </Group>
              <BodyText preserveLines>{item.message}</BodyText>
              {item.comment && (
                <Stack gap="xs">
                  <BodyTextBold>Our reply</BodyTextBold>
                  <BodyText preserveLines>{item.comment}</BodyText>
                </Stack>
              )}
            </Stack>
          </BaseCard>
        ))
      )}
    </Stack>
  );
}
