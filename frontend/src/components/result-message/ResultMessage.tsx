/**
 * ResultMessage Component
 *
 * A full-width alert banner for displaying pass/fail or success/error outcomes.
 * Mirrors the StateMessage pattern (icon sizing, title styling) but without
 * a max-width constraint.
 */

import { Alert } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import Icon from "@/components/icons";
import { BodyTextBlack, HeaderText } from "@/components/typography";
import classes from "./ResultMessage.module.css";

type ResultMessageVariant = "success" | "error";

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
  { color: string; icon: React.ReactNode }
> = {
  success: { color: "green", icon: <IconCheck /> },
  error: { color: "red", icon: <IconX /> },
};

const alertStyles = {
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
