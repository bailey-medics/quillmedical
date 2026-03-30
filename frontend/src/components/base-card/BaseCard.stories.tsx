/**
 * BaseCard Component Stories
 *
 * Demonstrates the standard card wrapper with fixed styling.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { BodyText, HeaderText } from "@/components/typography";
import BaseCard from "./BaseCard";

const meta: Meta<typeof BaseCard> = {
  title: "Cards/BaseCard",
  component: BaseCard,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof BaseCard>;

/** Default card with fixed styling */
export const Default: Story = {
  render: () => (
    <BaseCard>
      <Stack gap="sm">
        <HeaderText>Base card</HeaderText>
        <BodyText>
          Standard shadow, radius, border, and lg padding applied automatically.
        </BodyText>
      </Stack>
    </BaseCard>
  ),
};
