/**
 * StackedProfilePics Component Stories
 *
 * Demonstrates stacked participant avatars:
 * - Overlapping stack that fans out on hover
 * - Various participant counts
 * - Different sizes
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote, VariantStack } from "@/stories/variants";
import StackedProfilePics from "./StackedProfilePics";

const meta: Meta<typeof StackedProfilePics> = {
  title: "ProfilePic/Stacked",
  component: StackedProfilePics,
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
      <div>
        <StackedProfilePics participants={threeParticipants} size="sm" />
        <StoryNote mt="xs">Small (32px)</StoryNote>
      </div>
      <div>
        <StackedProfilePics participants={threeParticipants} size="md" />
        <StoryNote mt="xs">Medium (48px)</StoryNote>
      </div>
      <div>
        <StackedProfilePics participants={threeParticipants} size="lg" />
        <StoryNote mt="xs">Large (64px)</StoryNote>
      </div>
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

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
