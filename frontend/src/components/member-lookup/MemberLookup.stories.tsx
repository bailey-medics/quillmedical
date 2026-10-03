/**
 * Member lookup stories.
 *
 * The answer comes from the `onLookUp` prop, so each story hands back a
 * different one rather than stubbing a request. Type any whole address
 * and press "Find".
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import type { MemberLookup as Result } from "@/domains/orgUnit";
import { StoryNote } from "@/stories/variants";
import MemberLookup from "./MemberLookup";

const person = {
  id: 9,
  username: "a.patel",
  full_name: "Anita Patel",
  competencies: ["assess_clinician_passport"],
};

/** Answer every lookup the same way, at once. */
const answering = (result: Result) => async () => result;

const meta: Meta<typeof MemberLookup> = {
  title: "Form/Member lookup",
  component: MemberLookup,
  parameters: { layout: "padded" },
  args: {
    placeName: "Oncology",
    onLookUp: answering({ status: "found", user: person }),
    onFound: () => {},
    onCreate: () => {},
  },
  decorators: [
    (Story) => (
      <Box maw={640}>
        <BaseCard>
          <Story />
        </BaseCard>
      </Box>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MemberLookup>;

/** Somebody with an account elsewhere, who may be added. */
export const Found: Story = {
  render: (args) => (
    <>
      <MemberLookup {...args} />
      <StoryNote>Type a whole address and press Find.</StoryNote>
    </>
  ),
};

/** Somebody who is here already. */
export const AlreadyAMember: Story = {
  args: { onLookUp: answering({ status: "already_member", user: person }) },
};

/** An account the viewer may not add: nothing about it is named. */
export const NotAddable: Story = {
  args: { onLookUp: answering({ status: "not_addable", user: null }) },
};

/** Nobody has the address, so creating them is offered. */
export const NotFound: Story = {
  args: { onLookUp: answering({ status: "not_found", user: null }) },
};

/** Nobody has the address, and the viewer may not create accounts. */
export const NotFoundWithoutCreate: Story = {
  args: {
    onLookUp: answering({ status: "not_found", user: null }),
    // Set rather than left out: Storybook fills an unset `on*` prop
    // with a spy, which would bring the button back.
    onCreate: undefined,
  },
};

export const DarkMode: Story = {
  ...NotFound,
  globals: { colorScheme: "dark" },
};
