import { sampleLetter } from "@/demo-data/letters/demoSingleLetter";
import { MantineProvider } from "@mantine/core";
import { theme } from "@/theme";
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
    <MantineProvider theme={theme}>
      <div style={{ width: 720 }}>
        <LetterView letter={sample} onBack={() => alert("back")} />
      </div>
    </MantineProvider>
  ),
};

export const Loading: Story = {
  render: () => (
    <MantineProvider theme={theme}>
      <div style={{ width: 720 }}>
        <LetterView isLoading />
      </div>
    </MantineProvider>
  ),
};
