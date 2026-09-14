/**
 * VerificationPanel Component
 *
 * Shows the result of re-checking a sign-off against its own fingerprint.
 *
 * Both halves of the answer are rendered, deliberately. A match proves
 * the record has not changed since it was written; it does not prove a
 * professional registration, and it proves nothing at all to somebody who
 * distrusts Quill, because the same system computed and stored the hash.
 * The backend returns `proves` and `does_not_prove` as text for exactly
 * this reason, and showing only the first would overstate what happened.
 *
 * @example
 * ```tsx
 * <VerificationPanel verification={result} />
 * ```
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import Icon from "@/components/icons";
import {
  IconCircleCheck,
  IconAlertTriangle,
} from "@/components/icons/appIcons";
import { BodyText, BodyTextBold, Heading } from "@/components/typography";
import type { Verification } from "@lib/passport";

export interface VerificationPanelProps {
  /** The verify endpoint's result */
  verification: Verification;
}

/**
 * VerificationPanel
 *
 * Renders whether the record is unchanged, then what that does and does
 * not establish.
 */
export default function VerificationPanel({
  verification,
}: VerificationPanelProps) {
  const { unchanged, content_hash, proves, does_not_prove } = verification;

  return (
    <BaseCard data-testid="verification-panel">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <Icon
            icon={unchanged ? <IconCircleCheck /> : <IconAlertTriangle />}
            size="md"
            colour={unchanged ? "var(--success-color)" : "var(--alert-color)"}
          />
          <Heading>
            {unchanged
              ? "This record is unchanged"
              : "This record does not match its fingerprint"}
          </Heading>
        </Group>

        <Stack gap="xs">
          <BodyTextBold>What this shows</BodyTextBold>
          <BodyText>{proves}</BodyText>
        </Stack>

        <Stack gap="xs">
          <BodyTextBold>What this does not show</BodyTextBold>
          <BodyText>{does_not_prove}</BodyText>
        </Stack>

        {content_hash && (
          <Stack gap="xs">
            <BodyTextBold>Content hash</BodyTextBold>
            <BodyText>{content_hash}</BodyText>
          </Stack>
        )}
      </Stack>
    </BaseCard>
  );
}
