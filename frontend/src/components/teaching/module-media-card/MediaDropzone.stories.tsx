/**
 * MediaDropzone Stories
 *
 * The upload target for one video reference. It sits inside a table row
 * in the media card, so it is deliberately short — these stories show it
 * on its own, where its states are actually visible.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import MediaDropzone from "./MediaDropzone";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof MediaDropzone> = {
  title: "Teaching/Media dropzone",
  component: MediaDropzone,
  parameters: {
    layout: "padded",
  },
  args: {
    onDrop: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof MediaDropzone>;

export const Default: Story = {
  render: (args) => (
    <Stack gap="sm">
      <MediaDropzone {...args} />
      <StoryNote>
        Drag a file onto it, or click to browse. Only video is accepted — the
        type is checked here, before a byte leaves the browser.
      </StoryNote>
    </Stack>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Stack gap="sm">
      <MediaDropzone {...args} />
      <StoryNote>
        While another upload is in flight. A lecture is large enough that
        starting a second one by accident is worth preventing.
      </StoryNote>
    </Stack>
  ),
};
