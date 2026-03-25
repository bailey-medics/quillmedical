import type { Meta, StoryObj } from "@storybook/react-vite";
import PublicInfoCard from "./PublicInfoCard";
import { Box, Group } from "@mantine/core";
import { colours } from "@/styles/colours";

const meta = {
  title: "Public/InfoCard/PublicInfoCard",
  component: PublicInfoCard,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <Box bg={colours.navy} p="xl" maw={400}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PublicInfoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Clinical letters",
    heading: "42",
    description:
      "Letters generated this month across all departments and specialties.",
  },
};

export const LongContent: Story = {
  args: {
    label: "Average response time",
    heading: "2.4 hours",
    description:
      "Mean time from message receipt to clinician response, measured across all active organisations in the last 30 days.",
  },
};

export const MultipleCards: Story = {
  args: { label: "", heading: "", description: "" },
  render: () => (
    <Group grow align="stretch">
      <PublicInfoCard
        label="Clinical letters"
        heading="42"
        description="Letters generated this month across all departments."
      />
      <PublicInfoCard
        label="Response time"
        heading="2.4 hrs"
        description="Mean clinician response time in the last 30 days."
      />
      <PublicInfoCard
        label="Active users"
        heading="128"
        description="Clinicians and staff using the platform daily."
      />
    </Group>
  ),
};
