import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Stack } from "@mantine/core";
import {
  IconPencil,
  IconTrash,
  IconUserMinus,
} from "@/components/icons/appIcons";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyText, Heading } from "@/components/typography";
import EllipsisMenu from "./EllipsisMenu";

const meta: Meta<typeof EllipsisMenu> = {
  title: "Button/EllipsisMenu",
  component: EllipsisMenu,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof EllipsisMenu>;

export const Default: Story = {
  args: {
    "aria-label": "Actions",
    items: [
      { label: "Edit", icon: <IconPencil />, onClick: fn() },
      { label: "Delete", icon: <IconTrash />, color: "red", onClick: fn() },
    ],
  },
};

export const SingleItem: Story = {
  args: {
    "aria-label": "Actions for Dr Corbett",
    items: [
      {
        label: "Remove from organisation",
        icon: <IconUserMinus />,
        color: "red",
        onClick: fn(),
      },
    ],
  },
};

export const NoIcons: Story = {
  args: {
    "aria-label": "Options",
    items: [
      { label: "View details", onClick: fn() },
      { label: "Send message", onClick: fn() },
      { label: "Remove", color: "red", onClick: fn() },
    ],
  },
};

export const InsideCard: Story = {
  args: {
    "aria-label": "Staff actions",
    items: [
      { label: "Edit role", icon: <IconPencil />, onClick: fn() },
      {
        label: "Remove from organisation",
        icon: <IconUserMinus />,
        color: "red",
        onClick: fn(),
      },
    ],
  },
  render: (args) => (
    <BaseCard>
      <Stack gap="md">
        <Heading>Staff members</Heading>
        <BodyText>Dr Corbett — Clinician</BodyText>
        <EllipsisMenu {...args} />
      </Stack>
    </BaseCard>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
  render: (args) => (
    <Stack gap="xl">
      <BaseCard>
        <Stack gap="md">
          <Heading>Inside card</Heading>
          <EllipsisMenu {...args} />
        </Stack>
      </BaseCard>
      <EllipsisMenu {...args} />
    </Stack>
  ),
};
