import { sampleLetter } from "@/demo-data/letters/demoSingleLetter";
/**
 * LetterView Component Stories
 *
 * Demonstrates the clinical letter detail view:
 * - Full letter content display with markdown rendering
 * - Letter metadata (author, date, recipients)
 * - Letter status badges
 * - PDF download button
 * - Print-friendly layout
 * - Digital signature display
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import LetterView from "./LetterView";

const meta: Meta<typeof LetterView> = {
  title: "Letters/LetterView",
  component: LetterView,
};

export default meta;
type Story = StoryObj<typeof LetterView>;

const sample = sampleLetter;

export const Default: Story = {
  render: () => (
    <div style={{ width: 720 }}>
      <LetterView letter={sample} onBack={() => alert("back")} />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div style={{ width: 720 }}>
      <LetterView isLoading />
    </div>
  ),
};
