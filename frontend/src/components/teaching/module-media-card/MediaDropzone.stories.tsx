/**
 * MediaDropzone Stories
 *
 * A box to drop one file on. Every caller names the file types it
 * allows, as there is no default: the teaching card allows video, and
 * the passport's certificate uploader document and image types. Either
 * way the type is checked in the browser, before a byte is uploaded.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import MediaDropzone from "./MediaDropzone";
import { ACCEPTED_VIDEO_TYPES } from "./mediaFormat";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof MediaDropzone> = {
  title: "Form/Media dropzone",
  component: MediaDropzone,
  parameters: {
    layout: "padded",
  },
  // The teaching card's settings, which every story starts from. There
  // is no default list in the component itself.
  args: {
    onDrop: () => {},
    accept: ACCEPTED_VIDEO_TYPES,
    label: "Drop a video or click to browse",
  },
};

export default meta;

type Story = StoryObj<typeof MediaDropzone>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Stack gap="sm">
      <MediaDropzone {...args} />
      <StoryNote>While another upload is in flight.</StoryNote>
    </Stack>
  ),
};

/** On the dark theme: the resting fill is the input navy, darker on hover. */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
