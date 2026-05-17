import type { Meta, StoryObj } from "@storybook/react-vite";
import DashboardNav from "./DashboardNav";

const meta: Meta<typeof DashboardNav> = {
  component: DashboardNav,
  title: "Navigation/DashboardNav",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DashboardNav>;

const modules = [
  {
    id: "colonoscopy-optical-diagnosis-test",
    title: "Colonoscopy optical diagnosis",
  },
  { id: "chest-xray-interpretation-test", title: "Chest X-ray interpretation" },
];

export const Default: Story = {
  args: {
    modules,
    onModule: () => {},
    onSettings: () => {},
    onAdmin: () => {},
    onLogout: () => {},
  },
};

export const SingleModule: Story = {
  args: {
    modules: [modules[0]],
    onModule: () => {},
    onSettings: () => {},
    onAdmin: () => {},
    onLogout: () => {},
  },
};

export const WithoutAdmin: Story = {
  args: {
    modules,
    onModule: () => {},
    onSettings: () => {},
    onLogout: () => {},
  },
};

export const Empty: Story = {
  args: {
    modules: [],
    onModule: () => {},
    onSettings: () => {},
    onLogout: () => {},
  },
};
