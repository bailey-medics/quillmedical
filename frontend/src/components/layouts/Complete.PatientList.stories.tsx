/**
 * Complete Layout - PatientList Stories
 *
 * Demonstrates complete page layouts with PatientsList component in various states:
 * - With patients loaded
 * - Database initialising state
 * - No patients available
 * - Loading skeleton state
 */
import PatientsList from "@/components/patients/PatientsList";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MainLayout from "./MainLayout";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";

const meta: Meta<typeof MainLayout> = {
  title: "Layouts/PatientList",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof MainLayout>;

export const WithPatientList: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <PatientsList patients={demoPatientsList} />
    </MainLayout>
  ),
};

export const DatabaseInitialising: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <PatientsList patients={[]} fhirAvailable={false} />
    </MainLayout>
  ),
};

export const NoPatients: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <PatientsList patients={[]} fhirAvailable={true} />
    </MainLayout>
  ),
};

export const PatientListLoading: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <PatientsList patients={[]} isLoading={true} />
    </MainLayout>
  ),
};
