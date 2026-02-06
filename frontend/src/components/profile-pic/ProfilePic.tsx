/**
 * Profile Picture Component
 *
 * Displays a user or patient profile picture with three variations:
 * 1. Generic person icon (when no names provided) - uses Mantine's default avatar
 * 2. Real picture (when src is provided)
 * 3. Two-letter initials with coloured background (when names provided but no image)
 *
 * @example
 * // Generic person icon
 * <ProfilePic />
 *
 * @example
 * // Real picture
 * <ProfilePic givenName="John" familyName="Smith" colorFrom="#FF6B6B" colorTo="#4ECDC4" src="https://..." />
 *
 * @example
 * // Initials with gradient background
 * <ProfilePic givenName="John" familyName="Smith" colorFrom="#FF6B6B" colorTo="#4ECDC4" />  // Shows "JS"
 *
 * @example
 * // With FHIR Patient data (direct ingestion)
 * const patient = fhirPatient;
 * <ProfilePic
 *   givenName={patient.name[0].given[0]}
 *   familyName={patient.name[0].family}
 *   colorFrom="#FF6B6B"
 *   colorTo="#4ECDC4"
 *   src={patient.photo?.[0]?.url}
 * />
 */

import { Avatar, Skeleton, Tooltip } from "@mantine/core";

type ProfilePicSize = "sm" | "md" | "lg";

type Props = {
  /** Image source URL */
  src?: string | null;
  /** Given name from FHIR Patient.name[0].given[0] */
  givenName?: string;
  /** Family name from FHIR Patient.name[0].family */
  familyName?: string;
  /** Gradient start color (top-left) - hex color code */
  colorFrom?: string;
  /** Gradient end color (bottom-right) - hex color code */
  colorTo?: string;
  /** Force generic person icon instead of initials (useful for showing tooltip with name) */
  showGeneric?: boolean;
  /** Size of the avatar: sm (32px), md (48px), lg (64px) */
  size?: ProfilePicSize;
  /** Show loading skeleton */
  isLoading?: boolean;
};

/**
 * Get two-letter initials from given and family names
 * Returns first letter of given name + first letter of family name
 */
function getInitials(givenName?: string, familyName?: string): string {
  const given = givenName?.trim() || "";
  const family = familyName?.trim() || "";

  if (!given && !family) return "??";
  if (!family) return given.substring(0, 2).toUpperCase();
  if (!given) return family.substring(0, 2).toUpperCase();

  return (given.charAt(0) + family.charAt(0)).toUpperCase();
}

/**
 * Get full name from given and family names
 * Returns formatted full name or null if no names provided
 */
function getFullName(givenName?: string, familyName?: string): string | null {
  const given = givenName?.trim();
  const family = familyName?.trim();

  if (!given && !family) return null;
  if (!family) return given || null;
  if (!given) return family || null;

  return `${given} ${family}`;
}

export default function ProfilePic({
  src,
  givenName,
  familyName,
  colorFrom = "#667eea",
  colorTo = "#764ba2",
  showGeneric = false,
  size = "md",
  isLoading = false,
}: Props) {
  // Map size prop to pixel values
  const sizeMap: Record<ProfilePicSize, number> = {
    sm: 32,
    md: 48,
    lg: 64,
  };
  const avatarSize = sizeMap[size];
  const fullName = getFullName(givenName, familyName);

  // Loading state
  if (isLoading) {
    return <Skeleton circle height={avatarSize} width={avatarSize} />;
  }

  // Case 2: Real picture
  if (src) {
    const avatar = <Avatar radius="xl" size={avatarSize} src={src} />;
    return fullName ? (
      <Tooltip label={fullName} openDelay={400}>
        {avatar}
      </Tooltip>
    ) : (
      avatar
    );
  }

  // Case 3: Two-letter initials with gradient background
  if (!showGeneric && (givenName || familyName)) {
    const avatar = (
      <Avatar
        radius="xl"
        size={avatarSize}
        styles={{
          root: {
            background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)`,
          },
          placeholder: {
            color: "#333333",
            fontWeight: "bold",
            transform: "scale(1.2)",
          },
        }}
      >
        {getInitials(givenName, familyName)}
      </Avatar>
    );
    return fullName ? (
      <Tooltip label={fullName} openDelay={400}>
        {avatar}
      </Tooltip>
    ) : (
      avatar
    );
  }

  // Case 1: Generic person icon with gradient background
  const genericAvatar = (
    <Avatar
      radius="xl"
      size={avatarSize}
      styles={{
        root: {
          background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)`,
        },
        placeholder: {
          color: "#333333",
          fontWeight: "bold",
          transform: "scale(1.2)",
        },
      }}
    />
  );
  return fullName ? (
    <Tooltip label={fullName} openDelay={400}>
      {genericAvatar}
    </Tooltip>
  ) : (
    genericAvatar
  );
}
