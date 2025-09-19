import { MantineProvider } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MarkdownView from "./MarkdownView";

const meta: Meta<typeof MarkdownView> = {
  title: "Components/MarkdownView",
  component: MarkdownView,
};

export default meta;
type Story = StoryObj<typeof MarkdownView>;

// Build the sample string from an array of lines so code-fence lines are safe
// and don't appear raw inside the file editing surface.
const sampleLines = [
  "# Heading 1",
  "",
  "This is a paragraph with **bold** and *italic* text, plus a [link](https://example.com).",
  "",
  "- Item one",
  "- Item two",
  "",
  "1. First",
  "2. Second",
  "",
  "`inline code`",
  "",
  "```",
  "code block",
  "line 2",
  "```",
];

const sample = sampleLines.join("\n");

export const Default: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ maxWidth: 720 }}>
        <MarkdownView source={sample} />
      </div>
    </MantineProvider>
  ),
};

export const PlainText: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ maxWidth: 720 }}>
        <MarkdownView source={sample} asPlainText />
      </div>
    </MantineProvider>
  ),
};
