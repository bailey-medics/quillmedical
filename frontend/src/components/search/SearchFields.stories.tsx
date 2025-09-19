// src/components/SearchField.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import SearchField from "./SearchField";

const meta: Meta<typeof SearchField> = {
  title: "SearchField",
  component: SearchField,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof SearchField>;

// Default story: shows the magnifying glass, lets user click to expand
export const Default: Story = {};

// If you want a pre-expanded version for demo/testing
export const Expanded: Story = {
  render: () => <SearchField />,
  play: async ({ canvasElement }) => {
    // simulate a click so it shows expanded state
    const button = canvasElement.querySelector(
      'button[aria-label="Open search"]'
    );
    if (button) (button as HTMLButtonElement).click();
  },
};
