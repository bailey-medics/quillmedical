/**
 * StackedProfilePics Component Stories
 *
 * Demonstrates stacked participant avatars:
 * - Overlapping stack that fans out on hover
 * - Various participant counts
 * - Different sizes
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StateRow, VariantStack } from "@/stories/variants";
import StackedProfilePics from "./StackedProfilePics";

const meta: Meta<typeof StackedProfilePics> = {
  title: "ProfilePic/Stacked",
  component: StackedProfilePics,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof StackedProfilePics>;

export const Default: Story = {
  args: {
    participants: [
      { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
      { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
      { givenName: "Charlie", familyName: "Brown", gradientIndex: 6 },
    ],
  },
};

const threeParticipants = [
  { givenName: "Dr", familyName: "Corbett", gradientIndex: 1 },
  { givenName: "Gemma", familyName: "Lane", gradientIndex: 4 },
  { givenName: "Dr", familyName: "Patel", gradientIndex: 8 },
];

export const Sizes: Story = {
  render: () => (
    <VariantStack>
      <StateRow label="Small (32px)" align="start">
        <StackedProfilePics participants={threeParticipants} size="sm" />
      </StateRow>
      <StateRow label="Medium (48px)" align="start">
        <StackedProfilePics participants={threeParticipants} size="md" />
      </StateRow>
      <StateRow label="Large (64px)" align="start">
        <StackedProfilePics participants={threeParticipants} size="lg" />
      </StateRow>
    </VariantStack>
  ),
};

export const Loading: Story = {
  args: {
    participants: [
      { givenName: "Dr", familyName: "Corbett", gradientIndex: 1 },
      { givenName: "Gemma", familyName: "Lane", gradientIndex: 4 },
      { givenName: "Dr", familyName: "Patel", gradientIndex: 8 },
    ],
    isLoading: true,
  },
};
