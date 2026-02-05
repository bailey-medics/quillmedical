import { MantineProvider } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MarkdownView from "./MarkdownView";

const meta: Meta<typeof MarkdownView> = {
  title: "MarkdownView",
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

export const RenderedMarkdown: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ maxWidth: 720 }}>
        <MarkdownView source={sample} />
      </div>
    </MantineProvider>
  ),
};

export const Markdown: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ maxWidth: 720 }}>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            padding: "1rem",
            borderRadius: "4px",
          }}
        >
          {sample}
        </pre>
      </div>
    </MantineProvider>
  ),
};

export const Loading: Story = {
  render: () => (
    <MantineProvider>
      <div style={{ maxWidth: 720 }}>
        <MarkdownView source={sample} isLoading />
      </div>
    </MantineProvider>
  ),
};
