// src/components/TopRibbon.stories.tsx
import {
  AppShell,
  FocusTrap,
  NavLink,
  Overlay,
  Paper,
  Stack,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { PhoneFrame } from "../../../.storybook/utils/PhoneFrame";
import SideNav from "../navigation/SideNav"; // adjust path if needed
import TopRibbon, { type Patient } from "./TopRibbon";

/* ---------------- DESKTOP SHELL (real AppShell) ---------------- */

function DesktopShell(props: {
  patient: Patient | null;
  isLoading?: boolean;
  sticky?: boolean;
}) {
  const { patient, isLoading = false, sticky = false } = props;
  const [opened, { toggle, close }] = useDisclosure(false);
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  return (
    <AppShell
      header={{ height: 88 }}
      navbar={{
        width: 260,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
      withBorder={false}
    >
      <AppShell.Header>
        <TopRibbon
          onBurgerClick={toggle}
          isLoading={isLoading}
          patient={patient}
          navOpen={opened}
          sticky={sticky}
        />
      </AppShell.Header>

      <AppShell.Navbar id="app-navbar">
        <SideNav
          showSearch={isMobile}
          onNavigate={isMobile ? close : undefined}
        />
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ padding: 16, color: "#667085" }}>
          Desktop content area. Resize below “sm” to see overlay behaviour.
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

/* ---------------- MOBILE SHELL (inline "drawer" inside PhoneFrame) ----------------
   We render an absolutely-positioned panel + overlay INSIDE the PhoneFrame,
   so it cannot escape to the real page. This keeps the hamburger + nav working. */

function InlineDrawer({
  opened,
  onClose,
  children,
  labelledBy,
}: {
  opened: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  // Container fills the PhoneFrame content pane
  return (
    <>
      {/* Backdrop inside the PhoneFrame */}
      {opened && (
        <Overlay
          onClick={onClose}
          opacity={0.4}
          blur={2}
          radius={0}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 15, // above content (PhoneFrame content uses zIndex ~10)
          }}
        />
      )}

      {/* Sliding panel */}
      <FocusTrap active={opened}>
        <Paper
          id="app-navbar" // matches TopRibbon aria-controls
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          shadow="md"
          p="xs"
          withBorder
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: 260,
            zIndex: 16, // above overlay click area if you want the panel to receive clicks first
            transform: opened ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 150ms ease",
            background: "white",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Paper>
      </FocusTrap>
    </>
  );
}

function MobileShell(props: { patient: Patient | null; isLoading?: boolean }) {
  const { patient, isLoading = false } = props;
  const [opened, { toggle, close }] = useDisclosure(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // Close on Escape for better a11y in stories
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "white",
        position: "relative", // containing block for overlay/panel
        overflow: "hidden",
      }}
    >
      <TopRibbon
        onBurgerClick={toggle}
        isLoading={isLoading}
        patient={patient}
        navOpen={opened}
        sticky={false} // important: keep header inside PhoneFrame
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

      <InlineDrawer
        opened={opened}
        onClose={close}
        labelledBy={titleRef.current?.id}
      >
        {/* minimal nav for the story (use your SideNav if you prefer) */}
        <Stack gap="xs" role="navigation" aria-label="Primary">
          <NavLink label="Home" onClick={close} />
          <NavLink label="Patients" onClick={close} />
          <NavLink label="Letters" onClick={close} />
          <NavLink label="Settings" onClick={close} />
        </Stack>
      </InlineDrawer>
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
