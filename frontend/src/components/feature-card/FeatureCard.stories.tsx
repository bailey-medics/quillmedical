import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FeatureCard } from "./FeatureCard";
import FeatureCardGrid from "./FeatureCardGrid";
import { Box } from "@mantine/core";
import { IconMessage } from "@tabler/icons-react";

const meta = {
  title: "Public/FeatureCard/FeatureCard",
  component: FeatureCard,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <Box bg="#0A1628" p="2rem">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof FeatureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: IconMessage,
    title: "Structured Clinical Records",
    body: "OpenEHR archetypes ensure clinical data is semantically rich, queryable, and portable.",
  },
};

export const Clickable: Story = {
  args: {
    icon: IconMessage,
    title: "Structured Clinical Records",
    body: "OpenEHR archetypes ensure clinical data is semantically rich, queryable, and portable.",
    onClick: fn(),
  },
};

const features = [
  {
    title: "Structured Clinical Records",
    body: "OpenEHR archetypes ensure clinical data is semantically rich, queryable, and portable.",
  },
  {
    title: "Competency-Based Access",
    body: "CBAC models real NHS clinical hierarchies with fine-grained, auditable permissions.",
  },
  {
    title: "Named Patient Boards",
    body: "Organise patients into care boards by ward, specialty, or care team.",
  },
  {
    title: "Clinical Messaging",
    body: "FHIR Communication resources underpin a secure, threaded messaging layer.",
  },
  {
    title: "Letters & Documentation",
    body: "Generate structured outpatient letters and discharge summaries pre-populated from the record.",
  },
  {
    title: "Modular Deployment",
    body: "Activate only the modules your organisation needs — grow the system alongside your workflows.",
  },
];

export const Grid: Story = {
  args: { icon: IconMessage, title: "", body: "", onClick: fn() },
  render: () => (
    <FeatureCardGrid>
      {features.map((f) => (
        <FeatureCard
          key={f.title}
          icon={IconMessage}
          title={f.title}
          body={f.body}
          onClick={fn()}
        />
      ))}
    </FeatureCardGrid>
  ),
};
