/**
 * InstallAppModal Component Stories
 *
 * One story per install route. The manual routes carry the platform steps,
 * which should be checked against a real device before this is built into
 * pages.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Stack } from "@mantine/core";
import { StoryNote } from "@/stories/variants";
import InstallAppModal from "./InstallAppModal";

const meta: Meta<typeof InstallAppModal> = {
  title: "Overlays/Install app modal",
  component: InstallAppModal,
  parameters: {
    layout: "padded",
  },
  args: {
    opened: true,
    onInstall: fn(),
    onClose: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof InstallAppModal>;

function withNote(note: string): Story["decorators"] {
  return [
    (Story) => (
      <Stack gap="md">
        <Story />
        <StoryNote>{note}</StoryNote>
      </Stack>
    ),
  ];
}

/** Chrome, Edge and Samsung Internet: Quill can start the install */
export const OneTapInstall: Story = {
  args: { route: "prompt" },
  decorators: withNote(
    "The browser offered an install prompt. Install opens the browser's own confirmation.",
  ),
};

/** iPhone and iPad, in any browser */
export const Ios: Story = {
  args: { route: "ios" },
  decorators: withNote("iPhone and iPad: the share sheet."),
};

/** Safari 17 or later on a Mac */
export const MacSafari: Story = {
  args: { route: "macos-safari" },
  decorators: withNote("Safari on a Mac: File, then Add to Dock."),
};

/** Firefox on Android */
export const AndroidFirefox: Story = {
  args: { route: "android-firefox" },
  decorators: withNote("Firefox on Android: its menu."),
};

/** Firefox 143 or later on Windows */
export const WindowsFirefox: Story = {
  args: { route: "windows-firefox" },
  decorators: withNote("Firefox on Windows: Add tab to taskbar."),
};

/** A Chromium browser that has not offered a prompt */
export const ChromiumMenu: Story = {
  args: { route: "chromium-manual" },
  decorators: withNote(
    "Chrome or Edge with no prompt held, for example after its own prompt was dismissed.",
  ),
};

/** A browser that cannot install web apps */
export const Unsupported: Story = {
  args: { route: "unsupported" },
  decorators: withNote(
    "Firefox on a Mac or Linux, or a browser inside another app. Only reached from Settings.",
  ),
};
