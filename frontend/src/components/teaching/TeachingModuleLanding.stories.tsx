/**
 * Teaching Module Landing Page Story
 *
 * Full-page composition showing the TeachingModuleMain landing page
 * with two ActionCards: "Learning materials" and "Start assessment".
 * Uses TeachingLayout with ModuleNav sidebar.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SimpleGrid } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import ModuleNav from "@/components/navigation/ModuleNav";
import PageHeader from "@/components/typography/PageHeader";
import ActionCard from "@/components/action-card/ActionCard";
import { IconBook, IconChalkboardTeacher } from "@/components/icons/appIcons";

const meta: Meta = {
  title: "Teaching/Layouts/Module landing",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout
      sidebar={
        <ModuleNav
          moduleTitle="Colorectal polyps"
          onLearning={() => {}}
          onAssessment={() => {}}
          onBack={() => {}}
        />
      }
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
          title="Assessment"
          subtitle="Test your knowledge with a timed multiple-choice assessment. You must complete the learning materials first."
          buttonLabel="Start assessment"
          buttonUrl="/teaching/assessment/new"
        />
      </SimpleGrid>
    </TeachingLayout>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
