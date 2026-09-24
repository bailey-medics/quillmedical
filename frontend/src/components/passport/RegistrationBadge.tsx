/**
 * RegistrationBadge Component
 *
 * Shows a professional registration — GMC, NMC, GPhC, HCPC — as the
 * person declared it.
 *
 * The honesty is the point. Quill checks no register, so the badge says
 * "Declared" rather than rendering the number as though it had been
 * confirmed. A number beside a name reads as confirmation unless the
 * wording says otherwise, and a reader who cannot tell is worse off than
 * one who is simply told.
 *
 * @example
 * ```tsx
 * <RegistrationBadge registration={{ body: "GMC", number: "1234567" }} />
 * ```
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { IconInfoCircle } from "@/components/icons/appIcons";
import { BodyTextInline } from "@/components/typography";
import AppTooltip from "@/components/tooltip/AppTooltip";
import type { Registration } from "@lib/passport";

export interface RegistrationBadgeProps {
  /** The registration as declared */
  registration: Registration;
}

/**
 * RegistrationBadge
 *
 * Renders "GMC 1234567" with a marker saying it was declared.
 */
export default function RegistrationBadge({
  registration,
}: RegistrationBadgeProps) {
  const { body, number } = registration;

  return (
    <AppTooltip
      label={`As declared. Quill does not check the ${body} register, so look it up there before relying on it.`}
    >
      <Group gap="xs" wrap="nowrap" data-testid="registration-badge">
        <Icon
          icon={<IconInfoCircle />}
          size="sm"
          colour="var(--mantine-color-gray-6)"
        />
        <BodyTextInline>
          {body} {number}
        </BodyTextInline>
        <BodyTextInline c="dimmed">Declared</BodyTextInline>
      </Group>
    </AppTooltip>
  );
}
