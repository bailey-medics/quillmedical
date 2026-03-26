import type { Meta, StoryObj } from "@storybook/react-vite";
import { PublicFeatureCard } from "./PublicFeatureCard";
import PublicFeatureCardGrid from "./PublicFeatureCardGrid";
import { Box } from "@mantine/core";
import { IconMessage } from "@tabler/icons-react";
import { colours } from "@/styles/colours";

const meta = {
  title: "Public/FeatureCard/PublicFeatureCard",
  component: PublicFeatureCard,
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
  decorators: [
    (Story) => (
      <Box bg={colours.navy} p="2rem">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PublicFeatureCard>;

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
    href: "/features",
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
  args: { icon: IconMessage, title: "", body: "" },
  render: () => (
    <PublicFeatureCardGrid>
      {features.map((f) => (
        <PublicFeatureCard
          key={f.title}
          icon={IconMessage}
          title={f.title}
          body={f.body}
          href="/features"
        />
      ))}
    </PublicFeatureCardGrid>
  ),
};
