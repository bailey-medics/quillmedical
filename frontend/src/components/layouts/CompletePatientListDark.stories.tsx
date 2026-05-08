/**
 * Complete Layout - PatientList Dark Mode Stories
 *
 * Dark-mode variants of all PatientList layout stories.
 * Sets colorScheme global to "dark" so the Storybook decorator
 * applies forceColorScheme="dark" on the MantineProvider.
 */
import PatientsList from "@/components/patients";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MainLayout } from "@/components/layouts";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
import { Container } from "@mantine/core";

const meta: Meta<typeof MainLayout> = {
  title: "Layouts/PatientList-Dark",
  component: MainLayout,
  parameters: { layout: "fullscreen" },
  globals: { colorScheme: "dark" },
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
