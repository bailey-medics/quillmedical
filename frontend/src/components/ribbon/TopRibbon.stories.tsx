// src/components/TopRibbon.stories.tsx
import { AppShell, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { PhoneFrame } from "../../../.storybook/utils/PhoneFrame";
import NavigationDrawer from "../drawers/NavigationDrawer";
import SideNav from "../navigation/SideNav";
import TopRibbon, { type Patient } from "./TopRibbon";

/* ---------------- DESKTOP SHELL (AppShell + InlineDrawer — no Navbar) ---------------- */

function DesktopShell(props: {
  patient: Patient | null;
  isLoading?: boolean;
  sticky?: boolean;
}) {
  const { patient, isLoading = false, sticky = false } = props;
  const [opened, { toggle, close }] = useDisclosure(false);
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const HEADER_H = 88;
  const DRAWER_W = 260;

  return (
    <AppShell header={{ height: HEADER_H }} padding="md" withBorder={false}>
      <AppShell.Header>
        <TopRibbon
          onBurgerClick={toggle}
          isLoading={isLoading}
          patient={patient}
          navOpen={opened}
          sticky={sticky}
        />
      </AppShell.Header>

      {/* Inline drawer below the header (works for desktop and narrow widths alike) */}
      <div
        style={{
          position: "relative",
          minHeight: `calc(100vh - ${HEADER_H}px)`,
        }}
      >
        <NavigationDrawer
          opened={opened}
          onClose={close}
          topOffset={HEADER_H}
          width={DRAWER_W}
        >
          <div style={{ width: DRAWER_W }}>
            <SideNav showSearch={isMobile} onNavigate={close} />
          </div>
        </NavigationDrawer>

        <AppShell.Main>
          <div style={{ display: "flex", height: "100%" }}>
            {!isMobile && <SideNav showSearch={false} />}
            <div style={{ flex: 1, padding: 16, color: "#667085" }}>
              Desktop content area. Click the hamburger to open the drawer.
            </div>
          </div>
        </AppShell.Main>
      </div>
    </AppShell>
  );
}

/* ---------------- MOBILE SHELL (kept inside PhoneFrame) ---------------- */

function MobileShell(props: { patient: Patient | null; isLoading?: boolean }) {
  const { patient, isLoading = false } = props;
  const [opened, { toggle, close }] = useDisclosure(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  const DRAWER_W = 260;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "white",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <TopRibbon
        onBurgerClick={toggle}
        isLoading={isLoading}
        patient={patient}
        navOpen={opened}
        sticky={false}
      />

      <div style={{ padding: 16, color: "#667085" }}>
        <h2 ref={titleRef} style={{ margin: 0, fontSize: 16 }}>
          Demo content
        </h2>
        <p style={{ marginTop: 8 }}>
          Tap the hamburger to open navigation. Everything stays inside the
          phone frame.
        </p>
      </div>

      <NavigationDrawer opened={opened} onClose={close} width={DRAWER_W}>
        {/* You can also use your real SideNav here; inline links shown for brevity */}
        <div style={{ width: DRAWER_W }}>
          <SideNav showSearch={true} onNavigate={close} />
        </div>
      </NavigationDrawer>
    </div>
  );
}

/* ---------------- META & STORIES ---------------- */

const meta: Meta<typeof DesktopShell> = {
  title: "ribbon/TopRibbon",
  component: DesktopShell,
  args: {
    patient: {
      id: "123",
      name: "Jane Doe",
      dob: "1984-04-12",
      age: 41,
      sex: "Female",
      nhsNumber: "123 456 7890",
    } as Patient,
    isLoading: false,
    sticky: false,
  },
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof DesktopShell>;

export const Desktop: Story = {};

export const NoPatient: Story = { args: { patient: null } };

export const Loading: Story = { args: { isLoading: true } };

export const Mobile: Story = {
  render: (args) => (
    <PhoneFrame width={430} height={932}>
      <MobileShell {...args} />
    </PhoneFrame>
  ),
};
