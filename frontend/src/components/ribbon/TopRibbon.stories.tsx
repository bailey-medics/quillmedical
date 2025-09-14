// TopRibbon.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import TopRibbon, { type Patient } from "./TopRibbon";

const meta: Meta<typeof TopRibbon> = {
  title: "Ribbon/TopRibbon",
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

// Simple frame so we can demo container-width behaviour
function DemoFrame({
  width = 1024,
  children,
}: {
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width,
        margin: "24px auto",
        border: "1px dashed #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
      }}
    >
      {children}
    </div>
  );
}

const demoPatient: Patient = {
  id: "p123",
  name: "Alice Example",
  dob: "1980-01-01",
  age: 44,
  sex: "F",
  nhsNumber: "123 456 7890",
};

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
    patient: demoPatient,
    isLoading: false,
    navOpen: false,
    isNarrow: false,
  },
  render: (args) => <TopRibbon {...args} />,
};

/** Patient selected — narrow container (search should hide via @container) */
export const WithPatientNarrow: Story = {
  args: {
    patient: demoPatient,
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
