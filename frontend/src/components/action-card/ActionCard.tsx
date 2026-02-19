/**
 * ActionCard Component
 *
 * A reusable card component for displaying action items with an icon,
 * title, description, and call-to-action button.
 */

import { Button, Card, Stack, Text, Title, Group } from "@mantine/core";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface ActionCardProps {
  /** Icon element to display (from @tabler/icons-react) */
  icon: ReactNode;
  /** Card title */
  title: string;
  /** Card subtitle/description */
  subtitle: string;
  /** Button label text */
  buttonLabel: string;
  /** Button destination URL */
  buttonUrl: string;
  /** Optional onClick handler (overrides URL navigation if provided) */
  onClick?: () => void;
}

/**
 * ActionCard displays a clickable card with an icon, title, description,
 * and action button. Used for dashboard quick actions and admin tasks.
 *
 * Max-width is constrained to 25rem (400px) for consistent sizing.
 */
export default function ActionCard({
  icon,
  title,
  subtitle,
  buttonLabel,
  buttonUrl,
  onClick,
}: ActionCardProps) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder maw="25rem">
      <Stack gap="md">
        <Group>
          {icon}
          <Title order={3}>{title}</Title>
        </Group>
        <Text size="sm" c="dimmed">
          {subtitle}
        </Text>
        {onClick ? (
          <Button onClick={onClick} variant="light" fullWidth>
            {buttonLabel}
          </Button>
        ) : (
          <Button component={Link} to={buttonUrl} variant="light" fullWidth>
            {buttonLabel}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
