import type { Meta, StoryObj } from "@storybook/react-vite";
import ProfilePic from "./ProfilePic";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof ProfilePic> = {
  title: "Profile pic/Single",
  component: ProfilePic,
};

export default meta;

type Story = StoryObj<typeof ProfilePic>;

/**
 * Two-letter initials with vibrant gradient backgrounds
 * Initials are extracted from given + family name: "Alice" + "Anderson" → "AA"
 * Gradients flow from top-left to bottom-right at 45 degrees
 */
export const Default: Story = {
  tags: ["!test"],
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic
            givenName="Alice"
            familyName="Anderson"
            gradientIndex={0}
          />
          <StoryNote mt="xs">0</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Bob" familyName="Brown" gradientIndex={1} />
          <StoryNote mt="xs">1</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic
            givenName="Charlie"
            familyName="Davis"
            gradientIndex={2}
          />
          <StoryNote mt="xs">2</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Diana" familyName="Evans" gradientIndex={3} />
          <StoryNote mt="xs">3</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Frank" familyName="Green" gradientIndex={4} />
          <StoryNote mt="xs">4</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Grace" familyName="Hill" gradientIndex={5} />
          <StoryNote mt="xs">5</StoryNote>
        </div>
      </div>

      {/* Row 2 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Henry" familyName="Harris" gradientIndex={6} />
          <StoryNote mt="xs">6</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Iris" familyName="Irving" gradientIndex={7} />
          <StoryNote mt="xs">7</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Jack" familyName="Jones" gradientIndex={8} />
          <StoryNote mt="xs">8</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Kate" familyName="King" gradientIndex={9} />
          <StoryNote mt="xs">9</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Leo" familyName="Lane" gradientIndex={10} />
          <StoryNote mt="xs">10</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Maya" familyName="Mills" gradientIndex={11} />
          <StoryNote mt="xs">11</StoryNote>
        </div>
      </div>

      {/* Row 3 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Noah" familyName="Nash" gradientIndex={12} />
          <StoryNote mt="xs">12</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Olivia" familyName="Owen" gradientIndex={13} />
          <StoryNote mt="xs">13</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Paul" familyName="Price" gradientIndex={14} />
          <StoryNote mt="xs">14</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Quinn" familyName="Quick" gradientIndex={15} />
          <StoryNote mt="xs">15</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Rose" familyName="Reed" gradientIndex={16} />
          <StoryNote mt="xs">16</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Sam" familyName="Shaw" gradientIndex={17} />
          <StoryNote mt="xs">17</StoryNote>
        </div>
      </div>

      {/* Row 4 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Tara" familyName="Todd" gradientIndex={18} />
          <StoryNote mt="xs">18</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic
            givenName="Uma"
            familyName="Underwood"
            gradientIndex={19}
          />
          <StoryNote mt="xs">19</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Victor" familyName="Vale" gradientIndex={20} />
          <StoryNote mt="xs">20</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Wendy" familyName="Ward" gradientIndex={21} />
          <StoryNote mt="xs">21</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Xavier" familyName="Xu" gradientIndex={22} />
          <StoryNote mt="xs">22</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Yara" familyName="Young" gradientIndex={23} />
          <StoryNote mt="xs">23</StoryNote>
        </div>
      </div>

      {/* Row 5 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Zara" familyName="Zhang" gradientIndex={24} />
          <StoryNote mt="xs">24</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Adam" familyName="Allen" gradientIndex={25} />
          <StoryNote mt="xs">25</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Beth" familyName="Bell" gradientIndex={26} />
          <StoryNote mt="xs">26</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Carl" familyName="Cole" gradientIndex={27} />
          <StoryNote mt="xs">27</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Dora" familyName="Drake" gradientIndex={28} />
          <StoryNote mt="xs">28</StoryNote>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <ProfilePic givenName="Evan" familyName="Ellis" gradientIndex={29} />
          <StoryNote mt="xs">29</StoryNote>
        </div>
      </div>

      {/* Numbers below avatars indicate gradient index values (0-29) */}
      <StoryNote>
        Numbers below avatars indicate gradient index values (0-29)
      </StoryNote>
    </div>
  ),
};

/**
 * Generic person icon with gradient backgrounds
 * Icon is black, background uses gradient from top-left to bottom-right at 45 degrees
 * Hover for 1 second to see patient name tooltip
 */
export const Generic: Story = {
  tags: ["!test"],
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
  tags: ["!test"],
  args: {
    givenName: "Sarah",
    familyName: "Johnson",
    gradientIndex: 3,
    src: "https://i.pravatar.cc/150?img=45",
  },
};

/**
 * Different sizes: sm (32px), md (48px), lg (64px)
 * Shows how ProfilePic scales across the three predefined size options
 * Demonstrates initials, generic icons, and real pictures at each size
 */
export const Sizes: Story = {
  tags: ["!test"],
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Alice"
              familyName="Anderson"
              gradientIndex={3}
              size="sm"
            />
            <StoryNote mt="xs">Small (32px)</StoryNote>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Bob"
              familyName="Brown"
              gradientIndex={1}
              size="md"
            />
            <StoryNote mt="xs">Medium (48px)</StoryNote>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Charlie"
              familyName="Davis"
              gradientIndex={0}
              size="lg"
            />
            <StoryNote mt="xs">Large (64px)</StoryNote>
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Diana"
              familyName="Evans"
              gradientIndex={4}
              showGeneric
              size="sm"
            />
            <StoryNote mt="xs">Small (32px)</StoryNote>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Emma"
              familyName="Foster"
              gradientIndex={2}
              showGeneric
              size="md"
            />
            <StoryNote mt="xs">Medium (48px)</StoryNote>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Frank"
              familyName="Green"
              gradientIndex={5}
              showGeneric
              size="lg"
            />
            <StoryNote mt="xs">Large (64px)</StoryNote>
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Grace"
              familyName="Hill"
              gradientIndex={3}
              src="https://i.pravatar.cc/150?img=45"
              size="sm"
            />
            <StoryNote mt="xs">Small (32px)</StoryNote>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Henry"
              familyName="Irving"
              gradientIndex={1}
              src="https://i.pravatar.cc/150?img=12"
              size="md"
            />
            <StoryNote mt="xs">Medium (48px)</StoryNote>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <ProfilePic
              givenName="Ivy"
              familyName="Jones"
              gradientIndex={0}
              src="https://i.pravatar.cc/150?img=27"
              size="lg"
            />
            <StoryNote mt="xs">Large (64px)</StoryNote>
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
  tags: ["!test"],
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "2rem",
        alignItems: "flex-end",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <ProfilePic isLoading size="sm" />
        <StoryNote mt="xs">Small (32px)</StoryNote>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <ProfilePic isLoading size="md" />
        <StoryNote mt="xs">Medium (48px)</StoryNote>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <ProfilePic isLoading size="lg" />
        <StoryNote mt="xs">Large (64px)</StoryNote>
      </div>
    </div>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
