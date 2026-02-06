// src/components/layouts/MainLayout.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
// ...existing imports...
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
import MainLayout from "./MainLayout";

// demoPatientsList imported from centralized demo-data

const Content = () => (
  <div style={{ flex: 1, padding: 16, color: "#667085" }}>
    Desktop content area.
  </div>
);

// ...existing code...

const meta: Meta<typeof MainLayout> = {
  title: "Layout-MainLayout",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
  // Default child for most stories
  render: (args) => (
    <MainLayout {...args}>
      <Content />
    </MainLayout>
  ),
};

export default meta;
type Story = StoryObj<typeof MainLayout>;

export const NoPatient: Story = {
  args: { patient: null, isLoading: false },
};

export const WithPatient: Story = {
  args: { patient: demoPatientsList[0], isLoading: false },
};

export const Loading: Story = {
  args: { patient: null, isLoading: true },
};
