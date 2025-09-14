// src/components/layouts/MainLayout.stories.tsx
import type { Patient } from "@components/ribbon/TopRibbon";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MainLayout from "./MainLayout";

const demoPatient: Patient = {
  id: "p123",
  name: "Alice Example",
  dob: "1980-01-01",
  age: 44,
  sex: "F",
  nhsNumber: "123 456 7890",
};

const Content = () => (
  <div style={{ flex: 1, padding: 16, color: "#667085" }}>
    Desktop content area. Click the hamburger to open the drawer.
  </div>
);

const meta: Meta<typeof MainLayout> = {
  title: "Layouts/MainLayout",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
  // 👇 This render applies to ALL stories below
  render: (args) => (
    <MainLayout {...args}>
      <Content />
    </MainLayout>
  ),
};

export default meta;
type Story = StoryObj<typeof MainLayout>;

export const NoPatient: Story = {
  args: { patient: null, isLoading: false, sticky: true },
};

export const WithPatient: Story = {
  args: { patient: demoPatient, isLoading: false, sticky: true },
};

export const Loading: Story = {
  args: { patient: null, isLoading: true, sticky: true },
};
