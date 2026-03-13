/**
 * Stacked Profile Icons Component
 *
 * Displays multiple ProfilePic avatars overlapping in a stack.
 * On hover the stack fans out to reveal each participant clearly.
 *
 * @example
 * <StackedProfilePics
 *   participants={[
 *     { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
 *     { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
 *   ]}
 * />
 */

import ProfilePic from "./ProfilePic";
import { Skeleton } from "@mantine/core";
import classes from "./StackedProfilePics.module.css";

const SIZES = { sm: 32, md: 48, lg: 64 } as const;

export type StackedParticipant = {
  /** Given (first) name */
  givenName: string;
  /** Family (last) name */
  familyName?: string;
  /** Gradient colour index (0-29) */
  gradientIndex?: number;
  /** Optional image URL */
  src?: string;
};

type Props = {
  /** Participant list to render */
  participants: StackedParticipant[];
  /** Avatar size passed through to ProfilePic */
  size?: "sm" | "md" | "lg";
  /** Show loading skeletons instead of avatars */
  isLoading?: boolean;
};

export default function StackedProfilePics({
  participants,
  size = "md",
  isLoading = false,
}: Props) {
  if (participants.length === 0 && !isLoading) return null;

  if (isLoading) {
    const skeletonSize = SIZES[size];
    return <Skeleton circle height={skeletonSize} width={skeletonSize} />;
  }

  return (
    <div className={classes.stack} role="group" aria-label="Participants">
      {participants.map((p, i) => (
        <div
          className={classes.avatar}
          key={`${p.givenName}-${p.familyName ?? ""}-${i}`}
        >
          <ProfilePic
            givenName={p.givenName}
            familyName={p.familyName}
            gradientIndex={p.gradientIndex}
            src={p.src}
            size={size}
          />
        </div>
      ))}
    </div>
  );
}
