// TopRibbon.stories.tsx
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
/**
 * TopRibbon Component Stories
 *
 * Demonstrates the top navigation ribbon:
 * - Quill Medical branding/logo
 * - User profile menu
 * - Notification bell
 * - Navigation drawer toggle
 * - Responsive layout adjustments
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import TopRibbon from "./TopRibbon";

const meta: Meta<typeof TopRibbon> = {
  title: "Ribbons/TopRibbon",
  component: TopRibbon,
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
  argTypes: {
    onBurgerClick: { action: "burger-clicked" },
  },
};
export default meta;

type Story = StoryObj<typeof TopRibbon>;

// demoPatientsList comes from centralized demo-data

export const NoPatient: Story = {
  args: {
    patient: null,
    isLoading: false,
    navOpen: false,
  },
  render: (args) => <TopRibbon {...args} />,
};

/** Patient selected — wide container (search visible if your CQ allows) */
export const WithPatientWide: Story = {
  args: {
    patient: demoPatientsList[0],
    isLoading: false,
    navOpen: false,
    isNarrow: false,
  },
  render: (args) => <TopRibbon {...args} />,
};

/** Patient selected — narrow container (search should hide via @container) */
export const WithPatientNarrow: Story = {
  args: {
    patient: demoPatientsList[0],
    isLoading: false,
    navOpen: false,
    isNarrow: true,
  },
  render: (args) => <TopRibbon {...args} />,
};

/** Loading state — shows skeleton + Quill mark */
export const Loading: Story = {
  args: {
    patient: null,
    isLoading: true,
    navOpen: false,
  },
  render: (args) => <TopRibbon {...args} />,
};
