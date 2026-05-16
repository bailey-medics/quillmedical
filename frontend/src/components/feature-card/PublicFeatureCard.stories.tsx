import type { Meta, StoryObj } from "@storybook/react-vite";
import { PublicFeatureCard } from "./PublicFeatureCard";
import PublicFeatureCardGrid from "./PublicFeatureCardGrid";
import { IconMessage } from "@/components/icons/appIcons";

const meta = {
  title: "Public/Feature card/Public feature card",
  component: PublicFeatureCard,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          background: "var(--brand-primary)",
          minHeight: "100vh",
          padding: "var(--mantine-spacing-xl)",
        }}
      >
        <Story />
      </div>
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
