/**
 * ResultMessage Component
 *
 * A full-width alert banner for displaying pass/fail or success/error outcomes.
 * Mirrors the StateMessage pattern (icon sizing, title styling) but without
 * a max-width constraint.
 */

import { Alert } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconX,
} from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import { BodyTextBlack, HeaderText } from "@/components/typography";
import classes from "./ResultMessage.module.css";

type ResultMessageVariant = "success" | "fail" | "warning";

interface ResultMessageProps {
  /** Visual variant controlling colour and icon */
  variant: ResultMessageVariant;
  /** Bold title text displayed in the alert header */
  title: string;
  /** Optional subtitle shown below the title */
  subtitle?: string;
}

const variantConfig: Record<
  ResultMessageVariant,
  { color: string; icon: React.ReactElement }
> = {
  success: { color: "green", icon: <IconCheck /> },
  fail: { color: "red", icon: <IconX /> },
  warning: { color: "yellow", icon: <IconAlertTriangle /> },
};

const alertStyles = {
  root: classes.root,
  icon: classes.icon,
  title: classes.title,
};

export default function ResultMessage({
  variant,
  title,
  subtitle,
}: ResultMessageProps) {
  const { color, icon } = variantConfig[variant];

  return (
    <Alert
      icon={<Icon icon={icon} size="xl" />}
      title={<HeaderText>{title}</HeaderText>}
      color={color}
      variant="light"
      classNames={alertStyles}
    >
      {subtitle && <BodyTextBlack>{subtitle}</BodyTextBlack>}
    </Alert>
  );
}
