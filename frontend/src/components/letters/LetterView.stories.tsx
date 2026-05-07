/**
 * LetterView Component Stories
 *
 * Demonstrates the clinical letter detail view:
 * - Full letter content display
 * - Letter metadata (author, date)
 * - Back navigation
 * - Loading skeleton state
 */
import { sampleLetter } from "@/demo-data/letters/demoSingleLetter";
import type { Meta, StoryObj } from "@storybook/react-vite";
import LetterView from "./LetterView";

const meta: Meta<typeof LetterView> = {
  title: "Letters/LetterView",
  component: LetterView,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof LetterView>;

export const Default: Story = {
  args: {
    letter: sampleLetter,
    onBack: () => alert("back"),
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
