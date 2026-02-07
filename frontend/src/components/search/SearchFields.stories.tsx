/**
 * SearchField Component Stories
 *
 * Demonstrates the collapsible search input component:
 * - Collapsed state (magnifying glass icon)
 * - Expanded state (full search input)
 * - Click interaction to toggle visibility
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import SearchField from "./SearchFields";

const meta: Meta<typeof SearchField> = {
  title: "Search/SearchField",
  component: SearchField,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof SearchField>;

/**
 * Default collapsed state.
 * Shows magnifying glass icon button.
 * Click to expand and reveal search input field.
 */
export const Default: Story = {};

/**
 * Pre-expanded state for demonstration.
 * Automatically opens the search input on render.
 * Shows the full search input with clear and close buttons.
 */
export const Expanded: Story = {
  render: () => <SearchField />,
  play: async ({ canvasElement }) => {
    // simulate a click so it shows expanded state
    const button = canvasElement.querySelector(
      'button[aria-label="Open search"]',
    );
    if (button) (button as HTMLButtonElement).click();
  },
};
