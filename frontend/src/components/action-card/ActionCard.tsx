/**
 * ActionCard Component
 *
 * A reusable card component for displaying action items with an icon,
 * title, description, and call-to-action button.
 */

import { Card, Stack, Group } from "@mantine/core";
import type { ReactElement } from "react";
import Icon, { type IconSize } from "@/components/icons";
import ActionCardButton from "@/components/button/ActionCardButton";
import BodyText from "@/components/typography/BodyText";
import HeaderText from "@/components/typography/HeaderText";

interface ActionCardProps {
  /** Icon element to display (from @tabler/icons-react) */
  icon?: ReactElement;
  /** Icon size - defaults to lg (48px desktop, 32px mobile) */
  iconSize?: IconSize;
  /** Card title */
  title: string;
  /** Card subtitle/description */
  subtitle: string;
  /** Button label text */
  buttonLabel: string;
  /** Button destination URL */
  buttonUrl?: string;
  /** Optional onClick handler (overrides URL navigation if provided) */
  onClick?: () => void;
  /** Optional disabled state for the button */
  disabled?: boolean;
  /** Remove max-width constraint so the card fills its container */
  fullWidth?: boolean;
  /** Button variant (default: "light") */
  buttonVariant?: "light" | "filled";
}

/**
 * ActionCard displays a clickable card with an icon, title, description,
 * and action button. Used for dashboard quick actions and admin tasks.
 *
 * Max-width is constrained to 37.05rem (592.8px), which is 52% of the
 * Container size="lg" max-width (1140px).
 *
 * Icons default to size "lg" (48px on desktop, 32px on mobile) for
 * consistent prominent display across all action cards.
 */
export default function ActionCard({
  icon,
  iconSize = "lg",
  title,
  subtitle,
  buttonLabel,
  buttonUrl = "#",
  onClick,
  disabled = false,
  fullWidth = false,
  buttonVariant = "light",
}: ActionCardProps) {
  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      maw={fullWidth ? undefined : "37.05rem"}
      h="100%"
    >
      <Stack gap="md" h="100%">
        {icon ? (
          <Group>
            <Icon icon={icon} size={iconSize} />
            <HeaderText>{title}</HeaderText>
          </Group>
        ) : (
          <HeaderText>{title}</HeaderText>
        )}
        <BodyText>{subtitle}</BodyText>
        <div
          style={{
            marginTop: "auto",
            marginBottom: "calc(var(--mantine-spacing-md) * -0.5)",
          }}
        />
        <ActionCardButton
          label={buttonLabel}
          url={buttonUrl}
          onClick={onClick}
          disabled={disabled}
          variant={buttonVariant}
        />
      </Stack>
    </Card>
  );
}
