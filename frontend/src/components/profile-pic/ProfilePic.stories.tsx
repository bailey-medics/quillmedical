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
        gradientIndex={0}
        showGeneric
      />
      <ProfilePic
        givenName="Bob"
        familyName="Brown"
        gradientIndex={1}
        showGeneric
      />
      <ProfilePic
        givenName="Charlie"
        familyName="Davis"
        gradientIndex={2}
        showGeneric
      />
      <ProfilePic
        givenName="Diana"
        familyName="Evans"
        gradientIndex={3}
        showGeneric
      />
      <ProfilePic
        givenName="Frank"
        familyName="Green"
        gradientIndex={4}
        showGeneric
      />
      <ProfilePic
        givenName="Grace"
        familyName="Hill"
        gradientIndex={5}
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
    gradientIndex: 3,
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
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {/* Row 1 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <ProfilePic givenName="Alice" familyName="Anderson" gradientIndex={0} />
        <ProfilePic givenName="Bob" familyName="Brown" gradientIndex={1} />
        <ProfilePic givenName="Charlie" familyName="Davis" gradientIndex={2} />
        <ProfilePic givenName="Diana" familyName="Evans" gradientIndex={3} />
        <ProfilePic givenName="Frank" familyName="Green" gradientIndex={4} />
        <ProfilePic givenName="Grace" familyName="Hill" gradientIndex={5} />
      </div>

      {/* Row 2 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <ProfilePic givenName="Henry" familyName="Harris" gradientIndex={6} />
        <ProfilePic givenName="Iris" familyName="Irving" gradientIndex={7} />
        <ProfilePic givenName="Jack" familyName="Jones" gradientIndex={8} />
        <ProfilePic givenName="Kate" familyName="King" gradientIndex={9} />
        <ProfilePic givenName="Leo" familyName="Lane" gradientIndex={10} />
        <ProfilePic givenName="Maya" familyName="Mills" gradientIndex={11} />
      </div>

      {/* Row 3 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <ProfilePic givenName="Noah" familyName="Nash" gradientIndex={12} />
        <ProfilePic givenName="Olivia" familyName="Owen" gradientIndex={13} />
        <ProfilePic givenName="Paul" familyName="Price" gradientIndex={14} />
        <ProfilePic givenName="Quinn" familyName="Quick" gradientIndex={15} />
        <ProfilePic givenName="Rose" familyName="Reed" gradientIndex={16} />
        <ProfilePic givenName="Sam" familyName="Shaw" gradientIndex={17} />
      </div>

      {/* Row 4 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <ProfilePic givenName="Tara" familyName="Todd" gradientIndex={18} />
        <ProfilePic givenName="Uma" familyName="Underwood" gradientIndex={19} />
        <ProfilePic givenName="Victor" familyName="Vale" gradientIndex={20} />
        <ProfilePic givenName="Wendy" familyName="Ward" gradientIndex={21} />
        <ProfilePic givenName="Xavier" familyName="Xu" gradientIndex={22} />
        <ProfilePic givenName="Yara" familyName="Young" gradientIndex={23} />
      </div>

      {/* Row 5 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <ProfilePic givenName="Zara" familyName="Zhang" gradientIndex={24} />
        <ProfilePic givenName="Adam" familyName="Allen" gradientIndex={25} />
        <ProfilePic givenName="Beth" familyName="Bell" gradientIndex={26} />
        <ProfilePic givenName="Carl" familyName="Cole" gradientIndex={27} />
        <ProfilePic givenName="Dora" familyName="Drake" gradientIndex={28} />
        <ProfilePic givenName="Evan" familyName="Ellis" gradientIndex={29} />
      </div>

      {/* Row 5 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <ProfilePic
          givenName="High"
          familyName="Index Value"
          gradientIndex={30}
        />
      </div>
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
              gradientIndex={3}
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
              gradientIndex={1}
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
              gradientIndex={0}
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
              gradientIndex={4}
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
              gradientIndex={2}
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
              gradientIndex={5}
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
              gradientIndex={3}
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
              gradientIndex={1}
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
              gradientIndex={0}
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
  render: () => <ProfilePic isLoading />,
};
