/**
 * RegistrationBadge Component
 *
 * Shows a professional registration — GMC, NMC, GPhC, HCPC — and whether
 * anybody has actually checked it against the register.
 *
 * The honesty is the point. Quill checks no register itself, so an
 * unverified registration says so plainly rather than rendering as though
 * it had been confirmed. Sealing an unverified number into something that
 * looks authoritative is the false certainty the passport plan warns
 * against, and a reader who cannot tell the difference is worse off than
 * one who is simply told.
 *
 * @example
 * ```tsx
 * <RegistrationBadge registration={{ body: "GMC", number: "1234567", verified: false }} />
 * ```
 */

import { Group } from "@mantine/core";
import Icon from "@/components/icons";
import { IconShieldCheck, IconInfoCircle } from "@/components/icons/appIcons";
import { BodyTextInline } from "@/components/typography";
import AppTooltip from "@/components/tooltip/AppTooltip";
import type { Registration } from "@lib/passport";

export interface RegistrationBadgeProps {
  /** The registration as declared, with its verification state */
  registration: Registration;
}

/**
 * RegistrationBadge
 *
 * Renders "GMC 1234567" with a marker saying whether it was verified.
 */
export default function RegistrationBadge({
  registration,
}: RegistrationBadgeProps) {
  const { body, number, verified, verified_by, verified_on } = registration;

  const tooltip = verified
    ? `Checked against the ${body} register${
        verified_by ? ` by ${verified_by}` : ""
      }${verified_on ? ` on ${verified_on}` : ""}`
    : "Declared by the holder. Nobody has checked this against the register.";

  return (
    <AppTooltip label={tooltip}>
      <Group gap="xs" wrap="nowrap" data-testid="registration-badge">
        <Icon
          icon={verified ? <IconShieldCheck /> : <IconInfoCircle />}
          size="sm"
          colour={
            verified ? "var(--success-color)" : "var(--mantine-color-gray-6)"
          }
        />
        <BodyTextInline>
          {body} {number}
        </BodyTextInline>
        <BodyTextInline c="dimmed">
          {verified ? "Verified" : "Declared"}
        </BodyTextInline>
      </Group>
    </AppTooltip>
  );
}
