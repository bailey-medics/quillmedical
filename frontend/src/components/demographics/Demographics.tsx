import type { Patient } from "@/domains/patient";
import NationalNumber from "@/components/demographics/NationalNumber";
import { Skeleton, Text } from "@mantine/core";

type Props = {
  patient?: Patient;
  isLoading?: boolean;
};

export default function Demographics({ patient, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div style={{ flex: 1 }}>
        <Skeleton height={24} width="60%" mb={4} />
        <Skeleton height={16} width="80%" />
      </div>
    );
  }

  if (!patient) {
    return null;
  }

  return (
    <div style={{ flex: 1 }}>
      <Text fw={700} size="lg">
        {patient.name}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#4a5568",
        }}
      >
        {patient.dob ? `${patient.dob.replace(/-/g, "/")}` : ""}
        {patient.age !== undefined ? `    ${patient.age}` : ""}
        {patient.sex ? ` ${patient.sex}` : ""}
        {patient.nationalNumber ? (
          <>
            {"      "}
            <NationalNumber
              nationalNumber={patient.nationalNumber}
              nationalNumberSystem={patient.nationalNumberSystem}
            />
          </>
        ) : (
          ""
        )}
      </Text>
    </div>
  );
}
