/**
 * OfflineStrip Component Stories
 *
 * Demonstrates the thin connectivity strip in its different states,
 * rendered inside the real app layout (TopRibbon + SideNav) for context.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";
import { StoryNote } from "@/stories/variants";
import MainLayout from "@/components/layouts/MainLayout";
import { useEffect, useState } from "react";
import OfflineStrip from "./OfflineStrip";

/**
 * Decorator that renders the strip inside MainLayout, positioned
 * between the TopRibbon header and the main content — matching the
 * intended production placement. Sets data-offline on &lt;html&gt; to
 * activate the background tint.
 */
function LayoutDecorator({
  children,
  note,
  offline = true,
}: {
  children: React.ReactNode;
  note: string;
  offline?: boolean;
}) {
  useEffect(() => {
    if (offline) {
      document.documentElement.setAttribute("data-offline", "");
    } else {
      document.documentElement.removeAttribute("data-offline");
    }
    return () => {
      document.documentElement.removeAttribute("data-offline");
    };
  }, [offline]);

  return (
    <MainLayout patient={demoPatientsList[0]}>
      {children}
      <StoryNote>{note}</StoryNote>
    </MainLayout>
  );
}

const meta: Meta<typeof OfflineStrip> = {
  title: "Overlays/OfflineStrip",
  component: OfflineStrip,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof OfflineStrip>;

/** Offline state */
export const Offline: Story = {
  args: {
    state: "offline",
    lastSyncedAt: new Date(),
  },
  decorators: [
    (Story) => (
      <LayoutDecorator note="">
        <Story />
      </LayoutDecorator>
    ),
  ],
};

/** Reconnected — confirmation message with success colour */
export const Reconnected: Story = {
  args: {
    state: "reconnected",
    lastSyncedAt: new Date(),
  },
  decorators: [
    (Story) => (
      <LayoutDecorator
        offline={false}
        note="Strip shows &ldquo;Reconnected&rdquo; confirmation. Persists until next page navigation."
      >
        <Story />
      </LayoutDecorator>
    ),
  ],
};

/**
 * Cycles through connectivity states: online → offline → reconnected → online.
 * Each phase lasts 5 seconds.
 */
type Phase = "online" | "offline" | "reconnected";

function CyclingDemo() {
  const [phase, setPhase] = useState<Phase>("online");
  const lastSyncedAt = useState(() => new Date())[0];

  useEffect(() => {
    const phases: Phase[] = ["online", "offline", "reconnected"];
    let index = 0;

    const interval = setInterval(() => {
      index = (index + 1) % phases.length;
      setPhase(phases[index]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase === "offline") {
      document.documentElement.setAttribute("data-offline", "");
    } else {
      document.documentElement.removeAttribute("data-offline");
    }
    return () => {
      document.documentElement.removeAttribute("data-offline");
    };
  }, [phase]);

  return (
    <MainLayout patient={demoPatientsList[0]}>
      {phase !== "online" && (
        <OfflineStrip state={phase} lastSyncedAt={lastSyncedAt} />
      )}
      <StoryNote>
        Cycling through connectivity states every 5 seconds:
        <br />
        <br />
        1. Online — no strip, normal background
        <br />
        2. Offline — strip visible, background tinted
        <br />
        3. Reconnected — strip shows confirmation, background reverts
      </StoryNote>
    </MainLayout>
  );
}

/** Cycling — online (no strip) → offline → reconnected, 5s each */
export const Cycling: Story = {
  render: () => <CyclingDemo />,
};

/** Dark mode */
export const DarkMode: Story = {
  ...Offline,
  globals: { colorScheme: "dark" },
};
