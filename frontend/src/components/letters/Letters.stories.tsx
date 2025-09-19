import { MantineProvider } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import Letters, { type Letter } from "./Letters";

const meta: Meta<typeof Letters> = {
  title: "Letters",
  component: Letters,
};

export default meta;
type Story = StoryObj<typeof Letters>;

const sampleLetters: Letter[] = [
  {
    id: "l1",
    subject: "Discharge summary: left knee",
    from: "Orthopaedics",
    date: new Date().toISOString(),
    snippet: "Patient seen in clinic and referred for physiotherapy...",
  },
  {
    id: "l2",
    subject: "Letter: Investigations arranged",
    from: "Clinic Admin",
    date: new Date().toISOString(),
    snippet: "Bloods and stool sample arranged for next week...",
  },
];

export const Default: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ width: 480 }}>
        <Letters letters={sampleLetters} onOpen={(id) => alert(`open ${id}`)} />
      </div>
    </MantineProvider>
  ),
};

export const Empty: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ width: 480 }}>
        <Letters letters={[]} />
      </div>
    </MantineProvider>
  ),
};

export const Loading: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ width: 480 }}>
        <Letters isLoading />
      </div>
    </MantineProvider>
  ),
};
