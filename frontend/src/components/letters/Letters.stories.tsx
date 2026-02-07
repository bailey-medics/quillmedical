import { sampleLetters } from "@/demo-data/letters/demoLetters";
import { MantineProvider } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import Letters from "./Letters";

const meta: Meta<typeof Letters> = {
  title: "Letters/Letters",
  component: Letters,
};

export default meta;
type Story = StoryObj<typeof Letters>;

// sampleLetters imported from centralized demo-data

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
