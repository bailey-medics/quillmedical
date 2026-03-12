/**
 * Stacked Profile Icons Component
 *
 * Displays multiple ProfilePic avatars overlapping in a stack.
 * On hover the stack fans out to reveal each participant clearly.
 *
 * @example
 * <StackedProfileIcons
 *   participants={[
 *     { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
 *     { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
 *   ]}
 * />
 */

import ProfilePic from "./ProfilePic";
import classes from "./StackedProfileIcons.module.css";

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
};

export default function StackedProfileIcons({
  participants,
  size = "sm",
}: Props) {
  if (participants.length === 0) return null;

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
