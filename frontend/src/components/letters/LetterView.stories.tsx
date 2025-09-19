import { MantineProvider } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import LetterView from "./LetterView";

const meta: Meta<typeof LetterView> = {
  title: "LetterView",
  component: LetterView,
};

export default meta;
type Story = StoryObj<typeof LetterView>;

const sample = {
  id: "l1",
  subject: "Discharge summary: left knee",
  from: "Orthopaedics Dept",
  date: new Date().toISOString(),
  body: `Dear Patient,

Thank you for attending clinic. We recommend physiotherapy and return if symptoms persist.

Kind regards,
Orthopaedics Team`,
};

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
