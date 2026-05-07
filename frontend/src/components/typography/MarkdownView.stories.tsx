/**
 * MarkdownView Component Stories
 *
 * Demonstrates the markdown rendering component styled to match
 * our typography system:
 * - Rich text formatting (bold, italic, lists, links)
 * - Code blocks
 * - Safe HTML rendering (XSS protection via DOMPurify)
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import MarkdownView from "./MarkdownView";

const meta: Meta<typeof MarkdownView> = {
  title: "Foundations/Typography/MarkdownView",
  component: MarkdownView,
  parameters: {
    layout: "padded",
  },
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

/**
 * Default
 *
 * Renders formatted markdown with headings, bold, italic, lists,
 * links and code blocks.
 */
export const Default: Story = {
  args: {
    source: sample,
  },
};

/**
 * Plain Text
 *
 * Shows the raw markdown source as plain text with tags stripped.
 */
export const PlainText: Story = {
  args: {
    source: sample,
    asPlainText: true,
  },
};

/**
 * Loading
 *
 * Shows skeleton placeholders while markdown content is loading.
 */
export const Loading: Story = {
  args: {
    source: sample,
    isLoading: true,
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
