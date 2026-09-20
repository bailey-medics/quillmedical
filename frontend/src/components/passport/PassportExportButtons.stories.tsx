/**
 * PassportExportButtons Stories
 *
 * The three ways a holder takes their record away. The bundle is listed
 * last and styled as the primary action: a PDF is what somebody reaches
 * for first and is the least useful of the three, being a rendering
 * rather than the record.
 *
 * The stories do not download anything — the client functions would need
 * a backend — so what they show is the wording and the arrangement.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import PassportExportButtons from "./PassportExportButtons";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof PassportExportButtons> = {
  title: "Passport/PassportExportButtons",
  component: PassportExportButtons,
  parameters: { layout: "padded" },
  args: { passportId: "3f2a8c1e" },
};

export default meta;

type Story = StoryObj<typeof PassportExportButtons>;

export const Default: Story = {
  render: (args) => (
    <Stack gap="sm">
      <PassportExportButtons {...args} />
      <StoryNote>
        Reflections are deliberately not offered here. The backend leaves them
        out unless asked, and a checkbox beside a download button is not a
        deliberate enough act for something that can be disclosed in legal
        proceedings.
      </StoryNote>
    </Stack>
  ),
};
