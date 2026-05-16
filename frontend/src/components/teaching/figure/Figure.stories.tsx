import type { Meta, StoryObj } from "@storybook/react-vite";
import Figure from "./Figure";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof Figure> = {
  title: "Teaching/Figure",
  component: Figure,
};

export default meta;
type Story = StoryObj<typeof Figure>;

export const WithCaption: Story = {
  args: {
    src: "/storybook/paris-classification.png",
    alt: "Overview of polyp morphology categories",
    caption: "Figure 1: Paris classification overview",
  },
};

export const WithoutCaption: Story = {
  args: {
    src: "https://placehold.co/600x400/e2e8f0/475569?text=Clinical+image",
    alt: "Clinical image of colorectal polyp",
  },
};

export const AllVariants: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="With caption" horizontal={false}>
        <Figure
          src="https://placehold.co/600x400/e2e8f0/475569?text=With+caption"
          alt="Example with caption"
          caption="Figure 1: Paris classification overview"
        />
      </VariantRow>
      <VariantRow label="Without caption" horizontal={false}>
        <Figure
          src="https://placehold.co/600x400/e2e8f0/475569?text=No+caption"
          alt="Example without caption"
        />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...WithCaption,
  globals: { colorScheme: "dark" },
};
