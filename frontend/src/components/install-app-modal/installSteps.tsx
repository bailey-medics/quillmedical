/**
 * The install steps for each platform that needs them
 *
 * Kept apart from the modal so the modal file exports only its component,
 * and so a platform is added as one entry here. Each step names the control
 * as the platform labels it.
 */

import type { ReactElement } from "react";
import {
  IconDotsVertical,
  IconDownload,
  IconShare2,
  IconSquarePlus,
} from "@/components/icons/appIcons";
import type { InstallRoute } from "@lib/pwa/installRoute";

/** Every route the modal can show. An installed app is never asked. */
export type InstallModalRoute = Exclude<InstallRoute, "installed">;

/** The routes where the user follows steps rather than tapping Install. */
export type ManualInstallRoute = Exclude<
  InstallModalRoute,
  "prompt" | "unsupported"
>;

export interface InstallStep {
  /** One instruction, naming each control as the platform labels it. */
  text: string;
  /** The control's icon, where Tabler has a close match. */
  icon?: ReactElement;
}

export const installSteps: Record<ManualInstallRoute, InstallStep[]> = {
  ios: [
    {
      text: "Tap the Share button. In Safari it may be inside the ··· menu next to the address bar.",
      icon: <IconShare2 />,
    },
    {
      text: "Scroll down and tap Add to Home Screen.",
      icon: <IconSquarePlus />,
    },
    { text: "Check Open as Web App is switched on, then tap Add." },
  ],
  "macos-safari": [
    { text: "In the menu bar, choose File, then Add to Dock." },
    { text: "Click Add." },
  ],
  "android-firefox": [
    { text: "Tap the menu button.", icon: <IconDotsVertical /> },
    {
      text: "Tap Add app to Home screen. On some phones it is called Install.",
      icon: <IconSquarePlus />,
    },
    { text: "Tap Add to confirm." },
  ],
  "windows-firefox": [
    {
      text: "Select Add tab to taskbar at the right-hand end of the address bar.",
    },
    { text: "Confirm, and Quill is pinned to your taskbar." },
  ],
  "chromium-manual": [
    {
      text: "Open the browser menu at the top right.",
      icon: <IconDotsVertical />,
    },
    {
      text: "Choose Install Quill, or Add to Home screen on a phone. In Chrome on a computer it is under Cast, save and share.",
      icon: <IconDownload />,
    },
    { text: "Confirm with Install." },
  ],
};
