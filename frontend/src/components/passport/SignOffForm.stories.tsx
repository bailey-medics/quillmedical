/**
 * SignOffForm Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import SignOffForm from "./SignOffForm";
import { requested, requestedForLung } from "./fixtures";
import { StoryNote } from "@/stories/variants";
import { TEST_FRAMEWORK_CATALOGUE } from "@test/frameworkCatalogue";

const meta: Meta<typeof SignOffForm> = {
  title: "Passport/Sign-off form",
  component: SignOffForm,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffForm>;

export const Default: Story = {
  args: {
    catalogue: TEST_FRAMEWORK_CATALOGUE,
    signOff: requested,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

/**
 * A request for a competency on a scale of levels. The level
 * asked for is chosen to start with; choosing another turns the caveats
 * field into a required "Why a different level?".
 */
export const OnAScale: Story = {
  args: {
    signOff: {
      ...requested,
      competency: {
        id: "quill_test_refer_to_a_team",
        name: "Refer a patient to another team",
      },
      level: {
        id: "independently",
        name: "Independently",
      },
      requested_level: {
        id: "independently",
        name: "Independently",
      },
    },
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export const Submitting: Story = {
  args: {
    signOff: requested,
    onSubmit: fn(),
    onCancel: fn(),
    isSubmitting: true,
  },
};

/**
 * The declaration is the signature - the reason there is no drawing
 * canvas here.
 */
export const TheDeclarationIsTheSignature: Story = {
  render: (args) => (
    <Stack gap="sm">
      <SignOffForm {...args} />
      <StoryNote>
        Submission stays disabled until a basis is chosen and the box is ticked.
        No drawn or uploaded signature: a scribble looks more official and
        proves less, since anyone can draw anyone&rsquo;s name and no reference
        specimens exist to check one against. What carries the weight is the
        named account, the timestamp, the frozen registrations and the content
        hash.
      </StoryNote>
    </Stack>
  ),
  args: {
    signOff: requested,
    onSubmit: fn(),
    onCancel: fn(),
  },
};

/**
 * A request that says what it covers. The assessor sees it and cannot
 * change it: one who assessed something else declines.
 */
export const WithAScope: Story = {
  args: {
    signOff: requestedForLung,
    onSubmit: fn(),
    onCancel: fn(),
  },
};
