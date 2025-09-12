// src/components/TopRibbon.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import TopRibbon from "./TopRibbon";

const meta: Meta<typeof TopRibbon> = {
  title: "Layout/TopRibbon",
  component: TopRibbon,
  args: {
    isMobile: false,
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
export const Desktop: Story = {};
export const Mobile: Story = { args: { isMobile: true } };
export const NoPatient: Story = { args: { patient: null } };
