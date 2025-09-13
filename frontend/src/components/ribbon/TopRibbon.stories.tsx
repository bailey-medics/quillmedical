// src/components/TopRibbon.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PhoneFrame } from "../../../.storybook/utils/PhoneFrame";
import TopRibbon from "./TopRibbon";

const meta: Meta<typeof TopRibbon> = {
  title: "ribbon/TopRibbon",
  component: TopRibbon,
  args: {
    showBurger: true,
    onBurgerClick: () => {},
    patient: {
      id: "123",
      name: "Jane Doe",
      dob: "1984-04-12",
      age: 41,
      sex: "Female",
      nhsNumber: "123 456 7890",
    },
  },
};
export default meta;

type Story = StoryObj<typeof TopRibbon>;

export const Desktop: Story = { args: { showBurger: false } };

export const NoPatient: Story = { args: { patient: null } };

export const Loading: Story = { args: { isLoading: true } };

export const Mobile: Story = {
  render: (args) => (
    <PhoneFrame width={430} height={932}>
      <TopRibbon {...args} sticky={false} />
    </PhoneFrame>
  ),
  args: { showBurger: false },
};
