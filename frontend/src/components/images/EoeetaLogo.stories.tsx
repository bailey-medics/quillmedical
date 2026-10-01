/**
 * EoEETA Logo Component Stories
 *
 * Demonstrates the East of England Endoscopy Training Academy logo:
 * - On the navy public background it is used against
 * - At the sizes the public pages use
 */
import PublicDarkBackground from "@/components/background/PublicDarkBackground";
import { VariantRow, VariantStack } from "@/stories/variants";
import type { Meta, StoryObj } from "@storybook/react-vite";
import EoeetaLogo from "./EoeetaLogo";

const meta: Meta<typeof EoeetaLogo> = {
  title: "Images/EoEETA logo",
  component: EoeetaLogo,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    height: { control: "number" },
    alt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof EoeetaLogo>;

/**
 * Default logo, on its white panel.
 */
export const Default: Story = {};

/**
 * On the navy public background, where the white panel keeps the dark
 * lettering readable.
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
 * The sizes the public pages use.
 */
export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="4">
        <EoeetaLogo height={4} />
      </VariantRow>
      <VariantRow label="6 (default)">
        <EoeetaLogo height={6} />
      </VariantRow>
      <VariantRow label="8">
        <EoeetaLogo height={8} />
      </VariantRow>
    </VariantStack>
  ),
};
