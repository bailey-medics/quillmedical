/**
 * ActionCard Component
 *
 * A reusable card component for displaying action items with an icon,
 * title, description, and call-to-action button.
 */

import { Button, Card, Stack, Text, Title, Group } from "@mantine/core";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import Icon, { type IconSize } from "@/components/icons";

interface ActionCardProps {
  /** Icon element to display (from @tabler/icons-react) */
  icon: ReactNode;
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
}

/**
 * ActionCard displays a clickable card with an icon, title, description,
 * and action button. Used for dashboard quick actions and admin tasks.
 *
 * Max-width is constrained to 35.625rem (570px), which is half the
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
}: ActionCardProps) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder maw="35.625rem">
      <Stack gap="md">
        <Group>
          <Icon icon={icon} size={iconSize} />
          <Title order={3}>{title}</Title>
        </Group>
        <Text size="sm" c="dimmed">
          {subtitle}
        </Text>
        {onClick ? (
          <Button
            onClick={onClick}
            variant="light"
            fullWidth
            disabled={disabled}
          >
            {buttonLabel}
          </Button>
        ) : (
          <Button
            component={Link}
            to={buttonUrl}
            variant="light"
            fullWidth
            disabled={disabled}
          >
            {buttonLabel}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
