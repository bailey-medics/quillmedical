/**
 * QuillCard Component Stories
 *
 * Demonstrates the standard card wrapper with default and custom padding.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { BodyText, HeaderText } from "@/components/typography";
import { VariantRow, VariantStack } from "@/stories/variants";
import QuillCard from "./QuillCard";

const meta: Meta<typeof QuillCard> = {
  title: "Components/QuillCard",
  component: QuillCard,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof QuillCard>;

/** Default card with standard padding (lg) */
export const Default: Story = {
  render: () => (
    <QuillCard>
      <Stack gap="sm">
        <HeaderText>Default card</HeaderText>
        <BodyText>
          Standard shadow, radius, border, and lg padding applied automatically.
        </BodyText>
      </Stack>
    </QuillCard>
  ),
};

/** Card with compact (md) padding override */
export const CompactPadding: Story = {
  render: () => (
    <QuillCard padding="md">
      <Stack gap="sm">
        <HeaderText>Compact card</HeaderText>
        <BodyText>Same border treatment with tighter md padding.</BodyText>
      </Stack>
    </QuillCard>
  ),
};

/** All padding variants side by side */
export const AllPaddings: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="xs">
        <QuillCard padding="xs">
          <BodyText>xs padding</BodyText>
        </QuillCard>
      </VariantRow>
      <VariantRow label="sm">
        <QuillCard padding="sm">
          <BodyText>sm padding</BodyText>
        </QuillCard>
      </VariantRow>
      <VariantRow label="md">
        <QuillCard padding="md">
          <BodyText>md padding</BodyText>
        </QuillCard>
      </VariantRow>
      <VariantRow label="lg (default)">
        <QuillCard padding="lg">
          <BodyText>lg padding</BodyText>
        </QuillCard>
      </VariantRow>
      <VariantRow label="xl">
        <QuillCard padding="xl">
          <BodyText>xl padding</BodyText>
        </QuillCard>
      </VariantRow>
    </VariantStack>
  ),
};
