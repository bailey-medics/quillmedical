/**
 * AssessorDeclaration Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import AssessorDeclaration from "./AssessorDeclaration";
import CheckboxField from "@/components/form/CheckboxField";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof AssessorDeclaration> = {
  title: "Passport/Assessor declaration",
  component: AssessorDeclaration,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AssessorDeclaration>;

export const Default: Story = {};

export const WithContext: Story = {
  render: () => (
    <Stack gap="sm">
      <AssessorDeclaration />
      <StoryNote>
        The wording is fixed and cannot be passed in. Signing asks for no
        step-up authentication — what makes it deliberate is that somebody reads
        this statement and puts their name to it, which is what a wet signature
        has always been. The confirming checkbox belongs to the form that
        submits it, not to this component.
      </StoryNote>
    </Stack>
  ),
};

/**
 * With the confirmation inside it, as the sign-off form shows it. The
 * control is passed in rather than built here, because the same words
 * are also shown where no signing happens.
 */
export const WithConfirmation: Story = {
  render: () => (
    <AssessorDeclaration>
      <CheckboxField
        label="I confirm this declaration"
        checked={false}
        onChange={() => {}}
        required
      />
    </AssessorDeclaration>
  ),
};
