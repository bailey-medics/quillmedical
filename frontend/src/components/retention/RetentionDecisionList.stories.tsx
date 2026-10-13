/**
 * Retention Decision List Storybook Stories
 *
 * The Record retention page as a superadmin sees it, with made-up people
 * whose training records are awaiting a decision. Nothing is sent: the
 * button here waits a moment and takes the accounts that were marked off
 * the list, as the real page does once the server has carried them out.
 */

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { BodyText } from "@/components/typography";
import type {
  RetentionDecision,
  RetentionReview,
} from "@/lib/retention/retentionReviews";
import RetentionDecisionList from "./RetentionDecisionList";

/** Made-up people. None is, or resembles, a real account. */
const PEOPLE: RetentionReview[] = [
  {
    id: 1,
    user_id: 101,
    full_name: "Dr Amara Okafor",
    email: "amara.okafor@example.nhs.uk",
    org_unit_id: 3,
    organisation: "Example Endoscopy Training Academy",
    closed_at: "2027-01-14T09:00:00Z",
    due_on: "2030-07-14T09:00:00Z",
    attempts: 4,
    enrolments: 1,
    listed_at: "2030-07-15T03:30:00Z",
  },
  {
    id: 2,
    user_id: 102,
    full_name: "Mr Daniel Whitfield",
    email: "daniel.whitfield@example.nhs.uk",
    org_unit_id: 3,
    organisation: "Example Endoscopy Training Academy",
    closed_at: "2026-11-02T14:20:00Z",
    due_on: "2030-05-02T14:20:00Z",
    attempts: 1,
    enrolments: 1,
    listed_at: "2030-05-03T03:30:00Z",
  },
  {
    id: 3,
    user_id: 103,
    full_name: "Dr Priya Shah",
    email: "priya.shah@example.nhs.uk",
    org_unit_id: 7,
    organisation: "Example Respiratory Deanery",
    closed_at: "2028-03-30T11:05:00Z",
    due_on: "2030-03-30T11:05:00Z",
    attempts: 0,
    enrolments: 2,
    listed_at: "2030-03-31T03:30:00Z",
  },
  {
    id: 4,
    user_id: 104,
    full_name: "",
    email: "s.lindqvist@example.nhs.uk",
    org_unit_id: 3,
    organisation: "Example Endoscopy Training Academy",
    closed_at: "2026-12-19T16:45:00Z",
    due_on: "2030-06-19T16:45:00Z",
    attempts: 7,
    enrolments: 3,
    listed_at: "2030-06-20T03:30:00Z",
  },
];

const meta: Meta<typeof RetentionDecisionList> = {
  title: "Retention/Record retention page",
  component: RetentionDecisionList,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof RetentionDecisionList>;

/** The page's heading and opening words, around the list. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <Stack gap="lg">
      <PageHeader title="Record retention" />
      <BodyText>
        These accounts are closed, and their training records are past the
        period their sponsor asked for them to be kept. Nothing is deleted until
        you decide. Deleting cannot be undone.
      </BodyText>
      {children}
    </Stack>
  );
}

function Working({ refuse = [] }: { refuse?: number[] }) {
  const [reviews, setReviews] = useState(PEOPLE);
  const [refusals, setRefusals] = useState<Record<number, string>>({});

  async function carryOut(decisions: RetentionDecision[]) {
    await new Promise((resolve) => setTimeout(resolve, 800));

    const refused: Record<number, string> = {};
    for (const decision of decisions) {
      if (refuse.includes(decision.review_id)) {
        refused[decision.review_id] =
          "This account is no longer past its period: it has been opened again, or the period has changed. Nothing was deleted.";
      }
    }

    setRefusals(refused);
    setReviews((current) =>
      current.filter(
        (review) =>
          review.id in refused ||
          !decisions.some((decision) => decision.review_id === review.id),
      ),
    );
  }

  return (
    <Page>
      <RetentionDecisionList
        reviews={reviews}
        refusals={refusals}
        onCarryOut={carryOut}
        onClear={() => setRefusals({})}
      />
    </Page>
  );
}

/**
 * Four accounts awaiting a decision. Mark some delete or keep, leave the
 * rest, and carry them out: the ones marked leave the list.
 */
export const Default: Story = {
  render: () => <Working />,
};

/**
 * The first account was opened again after the list was drawn, so a
 * decision to delete it is refused and it stays, with the reason.
 */
export const WithARefusal: Story = {
  render: () => <Working refuse={[1]} />,
};

/** One account, which is how the list will usually look. */
export const OneAccount: Story = {
  render: () => (
    <Page>
      <RetentionDecisionList
        reviews={PEOPLE.slice(0, 1)}
        onCarryOut={async () => undefined}
      />
    </Page>
  ),
};
