/**
 * Complete Layout - PatientList Stories
 *
 * Demonstrates complete page layouts with PatientsList component in various states:
 * - With patients loaded
 * - Database initialising state
 * - No patients available
 * - Loading skeleton state
 */
import PatientsList from "@/components/patients";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MainLayout } from "@/components/layouts";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
import { Container } from "@mantine/core";

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
      <Container size="lg" py="xl">
        <PatientsList patients={demoPatientsList} />
      </Container>
    </MainLayout>
  ),
};

export const DatabaseInitialising: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <Container size="lg" py="xl">
        <PatientsList patients={[]} fhirAvailable={false} />
      </Container>
    </MainLayout>
  ),
};

export const NoPatients: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <Container size="lg" py="xl">
        <PatientsList patients={[]} fhirAvailable={true} />
      </Container>
    </MainLayout>
  ),
};

export const PatientListLoading: Story = {
  args: { patient: null, isLoading: false },
  render: (args) => (
    <MainLayout {...args}>
      <Container size="lg" py="xl">
        <PatientsList patients={[]} isLoading={true} />
      </Container>
    </MainLayout>
  ),
};
