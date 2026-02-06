import type { Patient } from "@/domains/patient";
import ProfilePic from "@/components/profile-pic/ProfilePic";
import { Group, Skeleton, Text, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

type Props = {
  patient: Patient | null;
  isLoading?: boolean;
  isCompact?: boolean;
  avatarSrc?: string | null;
};

export default function PatientDemographics({
  patient,
  isLoading = false,
  isCompact = false,
  avatarSrc = null,
}: Props) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const avatarSize = isSm ? "sm" : "lg";
  if (isLoading) {
    return (
      <Group align="center">
        <Skeleton circle width={48} height={48} />
        <div style={{ flex: 1 }}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={12} width="40%" style={{ marginTop: 6 }} />
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
        {patient.nhsNumber && (
          <Text
            style={{
              color: "var(--mantine-color-dimmed, #6b7280)",
              fontSize: 12,
            }}
          >
            NHS: {patient.nhsNumber}
          </Text>
        )}
      </div>
    </Group>
  );
}
