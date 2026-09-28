/**
 * SignOffList Component
 *
 * Sign-offs as a card of rows under a heading, one row per sign-off.
 *
 * Renders nothing for an empty list. The pages using it group sign-offs
 * by status and leave a group out when it has none, and they say for
 * themselves what an empty passport means; a heading over nothing would
 * say less than no heading.
 *
 * @example
 * ```tsx
 * <SignOffList title="Signed off" signOffs={signed} onSelect={open} />
 * ```
 */

import { Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import Divider from "@/components/divider/Divider";
import { Heading } from "@/components/typography";
import SignOffRow from "./SignOffRow";
import type { SignOff } from "@lib/passport";

export interface SignOffListProps {
  /** The card's heading */
  title: string;
  /** The sign-offs, in the order to show them */
  signOffs: SignOff[];
  /** Called with a sign-off's name when it is chosen */
  onSelect?: (name: string) => void;
}

/**
 * SignOffList
 *
 * Renders the rows in a card, or nothing when there are none.
 */
export default function SignOffList({
  title,
  signOffs,
  onSelect,
}: SignOffListProps) {
  if (signOffs.length === 0) return null;

  return (
    <BaseCard data-testid="sign-off-list">
      <Stack gap="xs">
        <Heading>{title}</Heading>
        {signOffs.map((signOff, index) => (
          <Stack key={signOff.name} gap="xs">
            {index > 0 && <Divider />}
            <SignOffRow signOff={signOff} onSelect={onSelect} />
          </Stack>
        ))}
      </Stack>
    </BaseCard>
  );
}
