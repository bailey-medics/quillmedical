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
        <div style={{ textAlign: "center" }}>
          <ProfilePic
            givenName="Alice"
            familyName="Anderson"
            gradientIndex={0}
          />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>0</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Bob" familyName="Brown" gradientIndex={1} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>1</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic
            givenName="Charlie"
            familyName="Davis"
            gradientIndex={2}
          />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>2</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Diana" familyName="Evans" gradientIndex={3} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>3</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Frank" familyName="Green" gradientIndex={4} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>4</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Grace" familyName="Hill" gradientIndex={5} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>5</div>
        </div>
      </div>

      {/* Row 2 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Henry" familyName="Harris" gradientIndex={6} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>6</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Iris" familyName="Irving" gradientIndex={7} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>7</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Jack" familyName="Jones" gradientIndex={8} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>8</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Kate" familyName="King" gradientIndex={9} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>9</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Leo" familyName="Lane" gradientIndex={10} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>10</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Maya" familyName="Mills" gradientIndex={11} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>11</div>
        </div>
      </div>

      {/* Row 3 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Noah" familyName="Nash" gradientIndex={12} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>12</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Olivia" familyName="Owen" gradientIndex={13} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>13</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Paul" familyName="Price" gradientIndex={14} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>14</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Quinn" familyName="Quick" gradientIndex={15} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>15</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Rose" familyName="Reed" gradientIndex={16} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>16</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Sam" familyName="Shaw" gradientIndex={17} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>17</div>
        </div>
      </div>

      {/* Row 4 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Tara" familyName="Todd" gradientIndex={18} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>18</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic
            givenName="Uma"
            familyName="Underwood"
            gradientIndex={19}
          />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>19</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Victor" familyName="Vale" gradientIndex={20} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>20</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Wendy" familyName="Ward" gradientIndex={21} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>21</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Xavier" familyName="Xu" gradientIndex={22} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>22</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Yara" familyName="Young" gradientIndex={23} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>23</div>
        </div>
      </div>

      {/* Row 5 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Zara" familyName="Zhang" gradientIndex={24} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>24</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Adam" familyName="Allen" gradientIndex={25} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>25</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Beth" familyName="Bell" gradientIndex={26} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>26</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Carl" familyName="Cole" gradientIndex={27} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>27</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Dora" familyName="Drake" gradientIndex={28} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>28</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <ProfilePic givenName="Evan" familyName="Ellis" gradientIndex={29} />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>29</div>
        </div>
      </div>

      {/* Row 6 */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <ProfilePic
            givenName="High"
            familyName="Index Value"
            gradientIndex={30}
          />
          <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>30</div>
        </div>
      </div>

      {/* Numbers below avatars indicate gradient index values (0-29) */}
      <div
        style={{
          marginTop: "1.5rem",
          fontSize: "0.875rem",
          fontStyle: "italic",
          color: "#6b7280",
        }}
      >
        Numbers below avatars indicate gradient index values (0-29)
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
