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
  title: "Foundations/Typography/Markdown view",
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

/**
 * With images
 *
 * Images are off unless the caller gives an `imageBase`, as a guide does.
 * The first step's image loads; the second's does not exist, so its alt
 * text is shown in its place.
 */
export const WithImages: Story = {
  args: {
    imageBase: ".",
    source: [
      "## Find the logo",
      "",
      "1. Look at the top of the page.",
      "   ![The Quill logo](quill-logo.png)",
      "2. Look for a picture that is not there.",
      "   ![A screenshot that has not been taken yet](missing/shot.png)",
      "3. Carry on.",
    ].join("\n"),
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
