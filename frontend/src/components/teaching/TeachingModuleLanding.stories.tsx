/**
 * Teaching Module Landing Page Story
 *
 * Full-page composition showing the TeachingModuleMain landing page.
 * Shows "Learning materials" + "Start assessment" when learning content
 * is available, or just "Start assessment" otherwise.
 * Uses TeachingLayout with TeachingMainNav sidebar.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SimpleGrid } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import TeachingMainNav from "@/components/navigation/teaching/TeachingMainNav";
import PageHeader from "@/components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { IconBook, IconChalkboardTeacher } from "@/components/icons/appIcons";

const meta: Meta = {
  title: "Teaching/Layouts/Module landing",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const WithLearning: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout
      sidebar={<TeachingMainNav />}
      footerText="Logged in: dr.jones"
    >
      <PageHeader title="Colorectal polyps" />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <ActionCard
          icon={<IconBook />}
          title="Learning materials"
          subtitle="Work through the learning slides covering polyp morphology, the Paris classification, and clinical implications."
          buttonLabel="Start learning"
          buttonUrl="/teaching/learn"
        />
        <ActionCard
          icon={<IconChalkboardTeacher />}
          title="Start assessment"
          subtitle="Test your knowledge with a timed multiple-choice assessment."
          buttonLabel="Start assessment"
          buttonUrl="/teaching/assessment/new"
        />
      </SimpleGrid>
    </TeachingLayout>
  ),
};

export const AssessmentOnly: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout
      sidebar={<TeachingMainNav />}
      footerText="Logged in: dr.jones"
    >
      <PageHeader title="Chest X-ray interpretation" />
      <ActionCard
        icon={<IconChalkboardTeacher />}
        title="Start assessment"
        subtitle="Test your knowledge with a timed multiple-choice assessment."
        buttonLabel="Start assessment"
        buttonUrl="/teaching/assessment/new"
      />
    </TeachingLayout>
  ),
};

export const DarkMode: Story = {
  ...WithLearning,
  globals: { colorScheme: "dark" },
};
