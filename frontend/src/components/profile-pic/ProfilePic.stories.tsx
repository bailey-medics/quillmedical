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
 * Different sizes: sm (32px), md (48px), lg (64px)
 * Shows how ProfilePic scales across the three predefined size options
 * Demonstrates initials, generic icons, and real pictures at each size
 */
export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      {/* Initials */}
      <div>
        <div style={{ marginBottom: "1rem", fontWeight: "bold" }}>Initials</div>
        <div
          style={{
            display: "flex",
            gap: "2rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Alice"
              familyName="Anderson"
              colorFrom="#667eea"
              colorTo="#764ba2"
              size="sm"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Small (32px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Bob"
              familyName="Brown"
              colorFrom="#4ECDC4"
              colorTo="#44A08D"
              size="md"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Medium (48px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Charlie"
              familyName="Davis"
              colorFrom="#FF6B6B"
              colorTo="#FFE66D"
              size="lg"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Large (64px)
            </div>
          </div>
        </div>
      </div>

      {/* Generic Icons */}
      <div>
        <div style={{ marginBottom: "1rem", fontWeight: "bold" }}>
          Generic Icons
        </div>
        <div
          style={{
            display: "flex",
            gap: "2rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Diana"
              familyName="Evans"
              colorFrom="#f093fb"
              colorTo="#f5576c"
              showGeneric
              size="sm"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Small (32px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Emma"
              familyName="Foster"
              colorFrom="#A8E6CF"
              colorTo="#3EECAC"
              showGeneric
              size="md"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Medium (48px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Frank"
              familyName="Green"
              colorFrom="#FFA07A"
              colorTo="#FF6347"
              showGeneric
              size="lg"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Large (64px)
            </div>
          </div>
        </div>
      </div>

      {/* Real Pictures */}
      <div>
        <div style={{ marginBottom: "1rem", fontWeight: "bold" }}>
          Real Pictures
        </div>
        <div
          style={{
            display: "flex",
            gap: "2rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Grace"
              familyName="Hill"
              colorFrom="#667eea"
              colorTo="#764ba2"
              src="https://i.pravatar.cc/150?img=45"
              size="sm"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Small (32px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Henry"
              familyName="Irving"
              colorFrom="#4ECDC4"
              colorTo="#44A08D"
              src="https://i.pravatar.cc/150?img=12"
              size="md"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Medium (48px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic
              givenName="Ivy"
              familyName="Jones"
              colorFrom="#FF6B6B"
              colorTo="#FFE66D"
              src="https://i.pravatar.cc/150?img=27"
              size="lg"
            />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Large (64px)
            </div>
          </div>
        </div>
      </div>

      {/* Loading States */}
      <div>
        <div style={{ marginBottom: "1rem", fontWeight: "bold" }}>
          Loading States
        </div>
        <div
          style={{
            display: "flex",
            gap: "2rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <ProfilePic isLoading size="sm" />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Small (32px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic isLoading size="md" />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Medium (48px)
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ProfilePic isLoading size="lg" />
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
              Large (64px)
            </div>
          </div>
        </div>
      </div>
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
        gap: "2rem",
        alignItems: "flex-end",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <ProfilePic isLoading size="sm" />
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          Small (32px)
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <ProfilePic isLoading size="md" />
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          Medium (48px)
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <ProfilePic isLoading size="lg" />
        <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
          Large (64px)
        </div>
      </div>
    </div>
  ),
};
