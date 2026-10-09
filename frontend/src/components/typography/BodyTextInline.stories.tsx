import type { Meta, StoryObj } from "@storybook/react-vite";
import BodyTextInline from "./BodyTextInline";
import BodyText from "./BodyText";

const meta: Meta<typeof BodyTextInline> = {
  title: "Foundations/Typography/Body text inline",
  component: BodyTextInline,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof BodyTextInline>;

export const Default: Story = {
  args: {
    children:
      "Thank you for the letter, I've received it and will review with my GP.",
  },
};

export const MultiLine: Story = {
  args: {
    children:
      "Hi Dr Fenwick,\n\nI wanted to follow up on our last appointment.\n\nKind regards,\nSarah",
  },
};

/**
 * Emphasises a name or an address inside a sentence. `BodyTextBold`
 * renders a block, so it cannot do this without breaking the line.
 */
export const Bold: Story = {
  render: () => (
    <BodyText>
      You have been asked by{" "}
      <BodyTextInline bold>Dr Amara Okonkwo</BodyTextInline> to sign off a{" "}
      <BodyTextInline bold>Perform thoracic ultrasound</BodyTextInline>{" "}
      competency.
    </BodyText>
  ),
};

/**
 * A value with nowhere to wrap, such as an address or a release id,
 * breaks inside itself instead of running off a narrow screen.
 */
export const BreakAnywhere: Story = {
  args: {
    breakAnywhere: true,
    children:
      "/teaching/assessments/12345/questions/67890/review/8ed08fd0c2b48463456cb1a88add2739f5fcd5a7",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 240 }}>
        <Story />
      </div>
    ),
  ],
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
