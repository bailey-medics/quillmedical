/**
 * Callout Component
 *
 * Styled call-out box for learning content. Renders as a coloured
 * left-bordered box with an icon and body text. Used in MDX slides.
 */

import { Alert } from "@mantine/core";
import {
  IconInfoCircle,
  IconAlertTriangle,
  IconCircleCheck,
} from "@/components/icons/appIcons";
import type { ReactNode } from "react";
import classes from "./Callout.module.css";

export type CalloutType = "info" | "warning" | "success";

export interface CalloutProps {
  /** Callout variant */
  type: CalloutType;
  /** Callout content */
  children: ReactNode;
}

const iconMap: Record<CalloutType, ReactNode> = {
  info: <IconInfoCircle />,
  warning: <IconAlertTriangle />,
  success: <IconCircleCheck />,
};

const colourMap: Record<CalloutType, string> = {
  info: "var(--info-color)",
  warning: "var(--warning-color)",
  success: "var(--success-color)",
};

export default function Callout({ type, children }: CalloutProps) {
  return (
    <Alert
      icon={iconMap[type]}
      className={classes.callout}
      styles={{
        root: { borderLeftColor: colourMap[type] },
      }}
    >
      {children}
    </Alert>
  );
}
