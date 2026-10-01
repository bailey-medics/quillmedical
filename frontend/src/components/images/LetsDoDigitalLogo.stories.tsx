/**
 * Let's Do Digital Logo Component Stories
 *
 * Demonstrates the Let's Do Digital logo:
 * - On the navy public background it is used against
 * - At a range of sizes
 */
import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import { VariantRow, VariantStack } from "@/stories/variants";
import type { Meta, StoryObj } from "@storybook/react-vite";
import LetsDoDigitalLogo from "./LetsDoDigitalLogo";

const meta: Meta<typeof LetsDoDigitalLogo> = {
  title: "Images/Let's Do Digital logo",
  component: LetsDoDigitalLogo,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    height: { control: "number" },
    alt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof LetsDoDigitalLogo>;

/**
 * Default logo, on its white panel.
 */
export const Default: Story = {};

/**
 * On the navy public background, where the white panel keeps the blue of
 * the mark visible.
 */
export const OnPublicBackground: Story = {
  decorators: [
    (Story) => (
      <PublicDarkBackground>
        <Story />
      </PublicDarkBackground>
    ),
  ],
};

/**
 * A range of sizes. The source file is 128px square, so it softens above
 * about 6rem.
 */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="3">
        <LetsDoDigitalLogo height={3} />
      </VariantRow>
      <VariantRow label="5 (default)">
        <LetsDoDigitalLogo height={5} />
      </VariantRow>
      <VariantRow label="6">
        <LetsDoDigitalLogo height={6} />
      </VariantRow>
    </VariantStack>
  ),
};
