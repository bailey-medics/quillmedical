/**
 * SideNav Component Stories
 *
 * Demonstrates the side navigation component with various configurations:
 * - Search field visibility
 * - Icon display options
 * - Patient navigation hierarchy
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchProvider } from "@lib/search";
import SideNav from "./SideNav";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";

const meta = {
  title: "Navigation/Side nav",
  component: SideNav,
  // The search field is bound to the shared search query, so it needs
  // the provider the app wraps every page in to be typed into.
  decorators: [
    (Story) => (
      <SearchProvider>
        <Story />
      </SearchProvider>
    ),
  ],
} satisfies Meta<typeof SideNav>;
export default meta;

type Story = StoryObj<typeof meta>;

const patient = demoPatientsList[0];
const patientHref = `/patients/${patient.id}`;

/**
 * Default navigation with icons.
 */
export const Default: Story = {
  args: { showSearch: false, showIcons: true },
};

/**
 * Navigation with search field and icons (mobile drawer style).
 */
export const WithSearch: Story = {
  args: { showSearch: true, showIcons: true },
};

/**
 * Patient message thread - three-level nesting: patient → Messages → thread.
 */
export const PatientMessageThread: Story = {
  args: {
    showSearch: false,
    showIcons: true,
    patientNav: [
      { label: patient.name, href: patientHref },
      { label: "Messages", href: `${patientHref}/messages` },
      {
        label: "Dr Fenwick, Imogen",
        href: `${patientHref}/messages/gastro-clinic`,
      },
    ],
  },
  parameters: { routerPath: `${patientHref}/messages/gastro-clinic` },
};

/**
 * Patient message thread - three-level nesting: patient → Messages → thread.
 */
export const PatientMessageThreadWithSearch: Story = {
  args: {
    showSearch: true,
    showIcons: true,
    patientNav: [
      { label: patient.name, href: patientHref },
      { label: "Messages", href: `${patientHref}/messages` },
      {
        label: "Dr Fenwick, Imogen",
        href: `${patientHref}/messages/gastro-clinic`,
      },
    ],
  },
  parameters: { routerPath: `${patientHref}/messages/gastro-clinic` },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
