/**
 * BaseCard Component Stories
 *
 * Demonstrates the standard card wrapper with fixed styling.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { BodyText, Heading } from "@/components/typography";
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
        <Heading>Base card</Heading>
        <BodyText>
          Standard shadow, radius, border, and lg padding applied automatically.
        </BodyText>
      </Stack>
    </BaseCard>
  ),
};

/** Coloured card — border removed, white text */
export const WithBackground: Story = {
  render: () => (
    <BaseCard bg="teal">
      <Stack gap="sm">
        <Heading c="white">Coloured card</Heading>
        <BodyText c="white">
          Pass a bg prop and the border disappears. Text is set to white
          automatically.
        </BodyText>
      </Stack>
    </BaseCard>
  ),
};
