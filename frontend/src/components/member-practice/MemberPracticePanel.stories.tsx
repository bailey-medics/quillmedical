/**
 * Member practice panel stories.
 *
 * One person at one org_unit. The panel takes its data as a prop, so
 * each story passes a different `MemberPractice` rather than stubbing a
 * request.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MemberPractice } from "@/domains/orgUnit";
import { StoryNote } from "@/stories/variants";
import MemberPracticePanel from "./MemberPracticePanel";

const practice: MemberPractice = {
  user_id: 4,
  username: "a.patel",
  full_name: "Anita Patel",
  org_unit_id: 3,
  org_unit_name: "Ward A",
  qualified: [
    "perform_venepuncture",
    "certify_death",
    "prescribe_controlled_schedule_2",
  ],
  authorised: [
    {
      competency: "perform_venepuncture",
      authorised_at: "2026-09-01T09:00:00Z",
      authorised_by: "Admin User",
    },
  ],
  may_grant: true,
};

/** Resolve at once, so the switches and modals behave in the canvas. */
const done = async () => {};

const meta: Meta<typeof MemberPracticePanel> = {
  title: "Cards/Member practice",
  component: MemberPracticePanel,
  parameters: { layout: "padded" },
  args: {
    practice,
    onAuthorise: done,
    onWithdraw: done,
    onGrantAndAuthorise: done,
  },
};
export default meta;

type Story = StoryObj<typeof MemberPracticePanel>;

/** A user manager's view: switches, and the rest of the catalogue. */
export const Default: Story = {};

/** Somebody who may authorise practice but not change competencies. */
export const MayNotGrant: Story = {
  args: { practice: { ...practice, may_grant: false } },
  render: (args) => (
    <>
      <MemberPracticePanel {...args} />
      <StoryNote>
        Without `manage_users`, or looking at their own record, the viewer sees
        only the switches.
      </StoryNote>
    </>
  ),
};

/** A teaching admin's view of a clinician who also sits teaching. */
export const TeachingAdminView: Story = {
  args: {
    practice: {
      ...practice,
      qualified: [...practice.qualified, "view_teaching_cases"],
      may_change: [
        "manage_teaching",
        "view_teaching_analytics",
        "view_teaching_cases",
      ],
    },
  },
  render: (args) => (
    <>
      <MemberPracticePanel {...args} />
      <StoryNote>
        Through `manage_teaching` alone, the viewer sees every competency held
        and may switch only the teaching ones. Grant competency offers only what
        they may grant.
      </StoryNote>
    </>
  ),
};

/** A row here for something they no longer hold. */
export const AuthorisedButNotHeld: Story = {
  args: {
    practice: {
      ...practice,
      authorised: [
        ...practice.authorised,
        {
          competency: "manage_users",
          authorised_at: "2026-08-01T09:00:00Z",
          authorised_by: null,
        },
      ],
    },
  },
  render: (args) => (
    <>
      <MemberPracticePanel {...args} />
      <StoryNote>
        The row authorises nothing until they hold the competency again. It is
        shown rather than hidden, so a lapsed qualification is seen.
      </StoryNote>
    </>
  ),
};

/** Somebody new, holding nothing yet. */
export const HoldsNothing: Story = {
  args: { practice: { ...practice, qualified: [], authorised: [] } },
};
