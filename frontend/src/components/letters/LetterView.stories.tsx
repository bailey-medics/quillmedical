import { sampleLetter } from "@/demo-data/letters/demoSingleLetter";
import { MantineProvider } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import LetterView from "./LetterView";

const meta: Meta<typeof LetterView> = {
  title: "LetterView",
  component: LetterView,
};

export default meta;
type Story = StoryObj<typeof LetterView>;

const sample = sampleLetter;

export const Default: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ width: 720 }}>
        <LetterView letter={sample} onBack={() => alert("back")} />
      </div>
    </MantineProvider>
  ),
};

export const Loading: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ width: 720 }}>
        <LetterView isLoading />
      </div>
    </MantineProvider>
  ),
};
