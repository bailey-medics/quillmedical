import type { Meta, StoryObj } from "@storybook/react-vite";
import ProfilePic from "./ProfilePic";

const meta: Meta<typeof ProfilePic> = {
  title: "ProfilePic",
  component: ProfilePic,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof ProfilePic>;

/**
 * Default: Generic person icon with gradient backgrounds
 * Icon is black, background uses gradient from top-left to bottom-right at 45 degrees
 * Hover for 1 second to see patient name tooltip
 */
export const Generic: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <ProfilePic
        givenName="Alice"
        familyName="Anderson"
        colorFrom="#FF6B6B"
        colorTo="#FFE66D"
        showGeneric
      />
      <ProfilePic
        givenName="Bob"
        familyName="Brown"
        colorFrom="#4ECDC4"
        colorTo="#44A08D"
        showGeneric
      />
      <ProfilePic
        givenName="Charlie"
        familyName="Davis"
        colorFrom="#A8E6CF"
        colorTo="#3EECAC"
        showGeneric
      />
      <ProfilePic
        givenName="Diana"
        familyName="Evans"
        colorFrom="#667eea"
        colorTo="#764ba2"
        showGeneric
      />
      <ProfilePic
        givenName="Frank"
        familyName="Green"
        colorFrom="#f093fb"
        colorTo="#f5576c"
        showGeneric
      />
      <ProfilePic
        givenName="Grace"
        familyName="Hill"
        colorFrom="#FFA07A"
        colorTo="#FF6347"
        showGeneric
      />
    </div>
  ),
};

/**
 * Real picture of a person
 */
export const RealPicture: Story = {
  args: {
    givenName: "Sarah",
    familyName: "Johnson",
    colorFrom: "#667eea",
    colorTo: "#764ba2",
    src: "https://i.pravatar.cc/150?img=45",
  },
};

/**
 * Two-letter initials with vibrant gradient backgrounds
 * Initials are extracted from given + family name: "Alice" + "Anderson" → "AA"
 * Gradients flow from top-left to bottom-right at 45 degrees
 */
export const Initials: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <ProfilePic
        givenName="Alice"
        familyName="Anderson"
        colorFrom="#FF6B6B"
        colorTo="#FFE66D"
      />
      <ProfilePic
        givenName="Bob"
        familyName="Brown"
        colorFrom="#4ECDC4"
        colorTo="#44A08D"
      />
      <ProfilePic
        givenName="Charlie"
        familyName="Davis"
        colorFrom="#A8E6CF"
        colorTo="#3EECAC"
      />
      <ProfilePic
        givenName="Diana"
        familyName="Evans"
        colorFrom="#667eea"
        colorTo="#764ba2"
      />
      <ProfilePic
        givenName="Frank"
        familyName="Green"
        colorFrom="#f093fb"
        colorTo="#f5576c"
      />
      <ProfilePic
        givenName="Grace"
        familyName="Hill"
        colorFrom="#FFA07A"
        colorTo="#FF6347"
      />
    </div>
  ),
};

/**
 * Loading state with skeleton placeholders
 * Shows circular skeleton while data is being fetched
 */
export const Loading: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <ProfilePic isLoading />
    </div>
  ),
};
