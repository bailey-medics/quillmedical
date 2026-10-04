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
 * While `isLoading` is set it draws placeholder rows instead, whatever
 * the list holds, so a page still fetching shows that something is on
 * its way rather than a blank space under the title.
 *
 * @example
 * ```tsx
 * <SignOffList title="Signed off" signOffs={signed} onSelect={open} />
 * ```
 */

import { Group, Skeleton, Stack } from "@mantine/core";
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
  /** Show placeholder rows while the sign-offs are being fetched */
  isLoading?: boolean;
}

/** How many placeholder rows stand in for a list not yet fetched. */
const PLACEHOLDER_ROWS = [1, 2, 3];

/**
 * SignOffList
 *
 * Renders the rows in a card, placeholders while loading, or nothing
 * when there are none.
 */
export default function SignOffList({
  title,
  signOffs,
  onSelect,
  isLoading = false,
}: SignOffListProps) {
  if (isLoading) {
    return (
      <BaseCard data-testid="sign-off-list-loading" aria-busy="true">
        <Stack gap="xs">
          <Skeleton height={28} width="30%" />
          {PLACEHOLDER_ROWS.map((row, index) => (
            <Stack key={row} gap="xs">
              {index > 0 && <Divider />}
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap="xs" w="60%">
                  <Skeleton height={20} width="70%" />
                  <Skeleton height={16} width="50%" />
                  <Skeleton height={16} width="40%" />
                </Stack>
                <Skeleton height={24} width={90} radius="xl" />
              </Group>
            </Stack>
          ))}
        </Stack>
      </BaseCard>
    );
  }

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
