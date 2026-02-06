import type { Patient } from "@/domains/patient";
import ProfilePic from "@/components/profile-pic/ProfilePic";
import {
  Group,
  Skeleton,
  Text,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

type Props = {
  patients: Patient[];
  isLoading?: boolean;
  onSelect?: (p: Patient) => void;
};

export default function PatientsList({
  patients,
  isLoading = false,
  onSelect,
}: Props) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const avatarSize = isSm ? "sm" : "lg";
  if (isLoading) {
    return (
      <div>
        <Group style={{ padding: 8 }} align="center">
          <ProfilePic isLoading size={avatarSize} />
          <div style={{ flex: 1 }}>
            <Skeleton height={16} width="20%" mb={4} />
            <Skeleton height={12} width="20%" />
          </div>
        </Group>
        <div style={{ height: 8 }} />
        <Group style={{ padding: 8 }} align="center">
          <ProfilePic isLoading size={avatarSize} />
          <div style={{ flex: 1 }}>
            <Skeleton height={16} width="20%" mb={4} />
            <Skeleton height={12} width="20%" />
          </div>
        </Group>
        <div style={{ height: 8 }} />
        <Group style={{ padding: 8 }} align="center">
          <ProfilePic isLoading size={avatarSize} />
          <div style={{ flex: 1 }}>
            <Skeleton height={16} width="20%" mb={4} />
            <Skeleton height={12} width="20%" />
          </div>
        </Group>
      </div>
    );
  }

  if (!patients || patients.length === 0) {
    return <Text>No patients</Text>;
  }

  return (
    <div>
      {patients.map((p) => {
        // Split patient name into given and family names
        const nameParts = p.name?.split(" ") || [];
        const givenName = nameParts[0];
        const familyName =
          nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

        return (
          <UnstyledButton
            key={p.id}
            onClick={() => onSelect?.(p)}
            style={{ textAlign: "left", width: "100%", padding: 8 }}
          >
            <Group style={{ width: "100%" }} align="center">
              <ProfilePic
                givenName={givenName}
                familyName={familyName}
                gradientIndex={p.gradientIndex}
                size={avatarSize}
              />
              <div style={{ flex: 1 }}>
                <Text fw={700} size="lg">
                  {p.name}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#4a5568",
                  }}
                >
                  {p.dob ? `${p.dob.replace(/-/g, "/")}` : ""}
                  {p.age !== undefined ? `    ${p.age}` : ""}
                  {p.sex ? ` ${p.sex}` : ""}
                  {p.nhsNumber ? `      NHS${p.nhsNumber}` : ""}
                </Text>
              </div>
              <div>
                {p.onQuill ? (
                  <Text style={{ fontSize: 12, color: "teal" }}>On Quill</Text>
                ) : null}
              </div>
            </Group>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
