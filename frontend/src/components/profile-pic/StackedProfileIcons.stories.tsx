/**
 * StackedProfileIcons Component Stories
 *
 * Demonstrates stacked participant avatars:
 * - Overlapping stack that fans out on hover
 * - Various participant counts
 * - Different sizes
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import StackedProfileIcons from "./StackedProfileIcons";

const meta: Meta<typeof StackedProfileIcons> = {
  title: "Avatars/StackedProfileIcons",
  component: StackedProfileIcons,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof StackedProfileIcons>;

export const TwoParticipants: Story = {
  args: {
    participants: [
      { givenName: "Dr", familyName: "Corbett", gradientIndex: 1 },
      { givenName: "Gemma", familyName: "Lane", gradientIndex: 4 },
    ],
  },
};

export const ThreeParticipants: Story = {
  args: {
    participants: [
      { givenName: "Dr", familyName: "Corbett", gradientIndex: 1 },
      { givenName: "Gemma", familyName: "Lane", gradientIndex: 4 },
      { givenName: "Dr", familyName: "Patel", gradientIndex: 8 },
    ],
  },
};

export const SingleParticipant: Story = {
  args: {
    participants: [{ givenName: "Dr", familyName: "Patel", gradientIndex: 8 }],
  },
};

export const MediumSize: Story = {
  args: {
    participants: [
      { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
      { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
      { givenName: "Charlie", familyName: "Brown", gradientIndex: 6 },
    ],
    size: "md",
  },
};

export const LargeSize: Story = {
  args: {
    participants: [
      { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
      { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
    ],
    size: "lg",
  },
};

export const FiveParticipants: Story = {
  args: {
    participants: [
      { givenName: "Dr", familyName: "Corbett", gradientIndex: 1 },
      { givenName: "Gemma", familyName: "Lane", gradientIndex: 4 },
      { givenName: "Dr", familyName: "Patel", gradientIndex: 8 },
      { givenName: "Nurse", familyName: "Williams", gradientIndex: 12 },
      { givenName: "Dr", familyName: "Singh", gradientIndex: 18 },
    ],
  },
};

export const Empty: Story = {
  args: {
    participants: [],
  },
};
