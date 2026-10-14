import type { Meta, StoryObj } from "@storybook/react-vite";
import PosterFrameModal from "./PosterFrameModal";

const meta: Meta<typeof PosterFrameModal> = {
  title: "Teaching/Poster frame modal",
  component: PosterFrameModal,
  parameters: {
    layout: "padded",
  },
  args: {
    opened: true,
    onClose: () => {},
    onSave: async () => true,
    filename: "colonoscopy-patient-experience.mp4",
  },
};

export default meta;
type Story = StoryObj<typeof PosterFrameModal>;

/** Nobody has chosen yet, so the job's default of five seconds is in use. */
export const DefaultFrame: Story = {
  args: { currentSeconds: null },
};

export const ChosenFrame: Story = {
  args: { currentSeconds: 85 },
};

export const SaveRejected: Story = {
  args: {
    currentSeconds: null,
    error:
      "This video is still being prepared. Choose its poster once it is ready.",
  },
};

export const DarkMode: Story = {
  ...ChosenFrame,
  globals: { colorScheme: "dark" },
};
