import type { Patient } from "@/domains/patient";
import { Avatar, Group, Skeleton, Text, UnstyledButton } from "@mantine/core";

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
  if (isLoading) {
    return (
      <div>
        <Skeleton height={56} />
        <div style={{ height: 8 }} />
        <Skeleton height={56} />
        <div style={{ height: 8 }} />
        <Skeleton height={56} />
      </div>
    );
  }

  if (!patients || patients.length === 0) {
    return <Text>No patients</Text>;
  }

  return (
    <div>
      {patients.map((p) => (
        <UnstyledButton
          key={p.id}
          onClick={() => onSelect?.(p)}
          style={{ textAlign: "left", width: "100%", padding: 8 }}
        >
          <Group style={{ width: "100%" }} align="center">
            <Avatar size={40} radius="xl" />
            <div style={{ flex: 1 }}>
              <Text fw={700}>{p.name}</Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "var(--mantine-color-dimmed, #6b7280)",
                }}
              >
                {p.dob ? `DOB: ${p.dob.replace(/-/g, "/")}` : ""}
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
      ))}
    </div>
  );
}
