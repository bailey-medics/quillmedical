import type { Meta, StoryObj } from "@storybook/react-vite";
import CaptionEditorModal from "./CaptionEditorModal";

const meta: Meta<typeof CaptionEditorModal> = {
  title: "Teaching/Caption editor modal",
  component: CaptionEditorModal,
  parameters: {
    layout: "padded",
  },
  args: {
    opened: true,
    onClose: () => {},
    onSave: async () => true,
  },
};

export default meta;
type Story = StoryObj<typeof CaptionEditorModal>;

const WHISPER_OUTPUT = `WEBVTT

00:00:01.000 --> 00:00:04.500
The seek 'em is entered under direct vision

00:00:04.500 --> 00:00:08.000
and the scope withdrawn slowly`;

/** What Whisper produces before anyone has corrected it. */
export const Unreviewed: Story = {
  args: {
    filename: "colonoscopy-intro.mp4",
    webvtt: WHISPER_OUTPUT,
  },
};

export const NoCaptionsYet: Story = {
  args: {
    filename: "colonoscopy-intro.mp4",
    webvtt: null,
  },
};

export const SaveRejected: Story = {
  args: {
    filename: "colonoscopy-intro.mp4",
    webvtt: WHISPER_OUTPUT,
    error: "Captions must be WebVTT, beginning with the line WEBVTT",
  },
};

export const Loading: Story = {
  args: {
    filename: "colonoscopy-intro.mp4",
    loading: true,
  },
};

export const DarkMode: Story = {
  ...Unreviewed,
  globals: { colorScheme: "dark" },
};
