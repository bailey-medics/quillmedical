/**
 * CaptionStatusBadge Component
 *
 * Displays whether a video's captions have been read by a person, or
 * are still the machine transcription as Whisper produced it.
 *
 * Separate from every other badge here because it carries a different
 * kind of fact. `SignOffStatusBadge` records a named person accepting
 * accountability for a clinical judgement; this records only that
 * somebody has read a transcript and corrected it. Borrowing either
 * that badge or `ActiveStatusBadge` would put the wrong words — "Signed
 * off", "Active" — against a state neither describes.
 *
 * Worth showing at all because the failure is silent: Whisper mishears
 * clinical terminology, and a learner relying on captions is given the
 * wrong word with nothing to signal it. An unreviewed track therefore
 * wants noticing from the card, without opening the editor.
 *
 * @example
 * ```tsx
 * <CaptionStatusBadge status="reviewed" />    // Green "Reviewed"
 * <CaptionStatusBadge status="unreviewed" />  // Amber "Not reviewed"
 * ```
 */

import { Badge } from "@mantine/core";
import {
  badgeColours,
  BADGE_VARIANT,
  type BadgeColourConfig,
} from "./badgeColours";
import BadgeSkeleton from "./BadgeSkeleton";

type CaptionStatus = "reviewed" | "unreviewed";

type Props = {
  /** Whether a person has read and saved the captions */
  status: CaptionStatus;
  /** Show loading skeleton instead of badge */
  isLoading?: boolean;
};

/**
 * `unreviewed` is a warning rather than neutral. Captions nobody has
 * checked are not merely incomplete — they are being served to learners
 * who cannot hear the audio, so the wrong word reaches the person least
 * able to catch it.
 */
const STATUS_CONFIG: Record<
  CaptionStatus,
  { label: string; colour: BadgeColourConfig }
> = {
  reviewed: { label: "Reviewed", colour: badgeColours.success },
  unreviewed: { label: "Not reviewed", colour: badgeColours.warning },
};

/**
 * CaptionStatusBadge
 *
 * Shows a coloured badge for whether captions have been reviewed.
 */
export default function CaptionStatusBadge({
  status,
  isLoading = false,
}: Props) {
  if (isLoading) {
    return <BadgeSkeleton />;
  }

  const { label, colour } = STATUS_CONFIG[status];

  return (
    <Badge color={colour.bg} c={colour.text} variant={BADGE_VARIANT}>
      {label}
    </Badge>
  );
}
