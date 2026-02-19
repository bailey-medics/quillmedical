/**
 * Letters List Component Module
 *
 * Displays a list of clinical letters with sender information, subject,
 * and preview snippets. Provides loading state and responsive layout
 * for mobile/desktop viewing.
 */

import { Skeleton, Text, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import ProfilePic from "@/components/profile-pic/ProfilePic";
import { SM_BREAKPOINT } from "@/lib/constants";

/**
 * Letter
 *
 * Represents a clinical letter in the list view.
 */
export type Letter = {
  /** Unique letter identifier */
  id: string;
  /** Letter subject/title */
  subject: string;
  /** Letter date (ISO string or display format) */
  date?: string;
  /** Sender department or full name */
  from?: string;
  /** Sender's given name (for profile pic) */
  fromGivenName?: string;
  /** Sender's family name (for profile pic) */
  fromFamilyName?: string;
  /** Gradient color index for sender avatar */
  gradientIndex?: number;
  /** Letter content preview/snippet */
  snippet?: string;
};

/**
 * Letters Props
 */
type Props = {
  /** Array of letters to display */
  letters?: Letter[];
  /** Whether letters are currently loading */
  isLoading?: boolean;
  /** Callback when letter is clicked to open detail view */
  onOpen?: (id: string) => void;
  /** Optional child content (e.g., custom empty state) */
  children?: ReactNode;
};

/**
 * Letters List
 *
 * Renders list of clinical letters with sender avatars, subject lines,
 * and preview snippets. Shows loading skeletons while fetching data.
 * Responsive layout adapts to screen size.
 *
 * @param props - Component props
 * @returns Letters list component
 */
export default function Letters({
  letters = [],
  isLoading = false,
  onOpen,
  children,
}: Props) {
  const isSm = useMediaQuery(`(min-width: ${SM_BREAKPOINT})`);
  const avatarSize = isSm ? "lg" : "sm";

  if (isLoading) {
    return (
      <div>
        <Title order={4}>Letters</Title>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
              <ProfilePic size={avatarSize} isLoading />
              <div style={{ flex: 1, marginLeft: 12 }}>
                <Skeleton height={14} width="60%" />
                <Skeleton height={12} width="40%" style={{ marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Title order={4}>Letters</Title>
        {children}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {letters.length === 0 && (
          <Text color="dimmed">No letters available</Text>
        )}

        {letters.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              cursor: onOpen ? "pointer" : "default",
            }}
            onClick={() => onOpen?.(l.id)}
          >
            <ProfilePic
              size={avatarSize}
              givenName={l.fromGivenName}
              familyName={l.fromFamilyName}
              gradientIndex={l.gradientIndex}
              showGeneric={!l.fromGivenName && !l.fromFamilyName}
            />
            <div style={{ flex: 1, marginLeft: 12 }}>
              <Text fw={600}>{l.subject}</Text>
              {l.snippet && (
                <Text size="sm" color="dimmed">
                  {l.snippet}
                </Text>
              )}
            </div>
            {l.date && (
              <Text size="xs" color="dimmed">
                {new Date(l.date).toLocaleDateString()}
              </Text>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
