/**
 * IconTextButton icon map
 *
 * Defines the allowed icon set for IconTextButton. Add new entries
 * here — the component and its stories pick them up automatically.
 */

import {
  IconArrowLeft,
  IconDownload,
  IconRefresh,
  IconSettings,
} from "@/components/icons/appIcons";
import type { ReactElement } from "react";

/** Allowed icon names — add new entries here to extend the component. */
const iconTextButtonIcons = {
  arrowLeft: <IconArrowLeft />,
  download: <IconDownload />,
  refresh: <IconRefresh />,
  settings: <IconSettings />,
} as const satisfies Record<string, ReactElement>;

export default iconTextButtonIcons;
