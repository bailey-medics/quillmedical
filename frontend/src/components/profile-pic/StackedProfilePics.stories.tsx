/**
 * StackedProfilePics Component Stories
 *
 * Demonstrates stacked participant avatars:
 * - Overlapping stack that fans out on hover
 * - Various participant counts
 * - Different sizes
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      <div>
        <StackedProfilePics participants={threeParticipants} size="sm" />
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          Small (32px)
        </div>
      </div>
      <div>
        <StackedProfilePics participants={threeParticipants} size="md" />
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          Medium (48px)
        </div>
      </div>
      <div>
        <StackedProfilePics participants={threeParticipants} size="lg" />
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          Large (64px)
        </div>
      </div>
    </div>
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
