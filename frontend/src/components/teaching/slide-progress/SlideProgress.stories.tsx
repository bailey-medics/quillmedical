import type { Meta, StoryObj } from "@storybook/react-vite";
import SlideProgress from "./SlideProgress";
import { VariantRow, VariantStack } from "@/stories/variants";

const meta: Meta<typeof SlideProgress> = {
  title: "Teaching/SlideProgress",
  component: SlideProgress,
};

export default meta;
type Story = StoryObj<typeof SlideProgress>;

export const Default: Story = {
  args: {
    current: 5,
    total: 23,
  },
};

export const Start: Story = {
  args: {
    current: 1,
    total: 23,
  },
};

export const End: Story = {
  args: {
    current: 23,
    total: 23,
  },
};

export const AllVariants: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Start" horizontal={false}>
        <SlideProgress current={1} total={23} />
      </VariantRow>
      <VariantRow label="Middle" horizontal={false}>
        <SlideProgress current={12} total={23} />
      </VariantRow>
      <VariantRow label="End" horizontal={false}>
        <SlideProgress current={23} total={23} />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
