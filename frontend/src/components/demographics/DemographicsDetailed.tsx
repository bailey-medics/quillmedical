/**
 * Demographics Detailed Component
 *
 * Expanded patient demographics view with profile picture, name, age,
 * gender, DOB, and national number. Supports compact/full layout modes
 * and responsive sizing for mobile/desktop.
 */

import type { Patient } from "@/domains/patient";
import NationalNumber from "@/components/demographics/NationalNumber";
import ProfilePic from "@/components/profile-pic";
import { Group, Skeleton, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

/**
 * DemographicsDetailed Props
 */
type Props = {
  /** Patient data to display (null if not loaded) */
  patient: Patient | null;
  /** Whether patient data is currently loading */
  isLoading?: boolean;
  /** Whether to use compact layout with smaller fonts */
  isCompact?: boolean;
  /** Optional custom avatar image source URL */
  avatarSrc?: string | null;
};

/**
 * Demographics Detailed
 *
 * Renders detailed patient demographics with:
 * - Profile picture/avatar with gradient
 * - Patient name
 * - Age, gender, DOB
 * - National number (NHS format)
 * - Responsive sizing (mobile/desktop)
 * - Compact/full layout modes
 * - Loading skeleton state
 *
 * @param props - Component props
 * @returns Detailed demographics component
 */
export default function DemographicsDetailed({
  patient,
  isLoading = false,
  isCompact = false,
  avatarSrc = null,
}: Props) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const avatarSize = isSm ? "sm" : "lg";
  const skeletonAvatarSize = isSm ? 36 : 48;
  const nameFontSize = isCompact ? 14 : 16;
  const detailsFontSize = isCompact ? 12 : 14;

  if (isLoading) {
    return (
      <Group align="center">
        <Skeleton
          circle
          width={skeletonAvatarSize}
          height={skeletonAvatarSize}
        />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <Skeleton height={nameFontSize} width="50%" mb={4} />
          <Skeleton height={detailsFontSize} width="70%" mb={6} />
          <Skeleton height={12} width="45%" mb={2} />
          <Skeleton height={12} width="40%" />
        </div>
      </Group>
    );
  }

  if (!patient) return null;

  // Split patient name into given and family names (simple split for now)
  const nameParts = patient.name?.split(" ") || [];
  const givenName = nameParts[0];
  const familyName =
    nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

  return (
    <Group align="center">
      <ProfilePic
        src={avatarSrc}
        givenName={givenName}
        familyName={familyName}
        gradientIndex={patient.gradientIndex}
        size={avatarSize}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Text fw={700} style={{ fontSize: isCompact ? 14 : 16 }}>
          {patient.name}
        </Text>
        <Text
          style={{
            color: "var(--mantine-color-dimmed, #6b7280)",
            fontSize: isCompact ? 12 : 14,
          }}
        >
          {patient.dob ? `DOB: ${patient.dob}` : ""}
          {patient.age ? ` • Age: ${patient.age}` : ""}
          {patient.sex ? ` • ${patient.sex}` : ""}
        </Text>
        {(patient.address || patient.telephone || patient.mobile) && (
          <div style={{ marginTop: 6 }}>
            {patient.address && <Text size="xs">{patient.address}</Text>}
            {patient.telephone && (
              <Text size="xs">Tel: {patient.telephone}</Text>
            )}
            {patient.mobile && <Text size="xs">Mobile: {patient.mobile}</Text>}
          </div>
        )}
        {patient.onQuill !== undefined && (
          <Text size="xs" style={{ marginTop: 6 }}>
            {patient.onQuill ? "On Quill app" : "Not on Quill"}
          </Text>
        )}
        {patient.nextOfKin &&
          (patient.nextOfKin.name || patient.nextOfKin.phone) && (
            <div style={{ marginTop: 6 }}>
              {patient.nextOfKin.name && (
                <Text size="xs">Next of kin: {patient.nextOfKin.name}</Text>
              )}
              {patient.nextOfKin.phone && (
                <Text size="xs">
                  Next of kin tel: {patient.nextOfKin.phone}
                </Text>
              )}
            </div>
          )}
        {patient.nationalNumber && (
          <Text
            style={{
              color: "var(--mantine-color-dimmed, #6b7280)",
              fontSize: 12,
            }}
          >
            <NationalNumber
              nationalNumber={patient.nationalNumber}
              nationalNumberSystem={patient.nationalNumberSystem}
            />
          </Text>
        )}
      </div>
    </Group>
  );
}
