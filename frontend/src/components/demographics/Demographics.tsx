/**
 * Demographics Component
 *
 * Compact patient demographics summary displaying name, age, gender, DOB,
 * and national number. Used in patient cards and list views. Provides
 * loading skeleton and null-safe rendering.
 */

import type { Patient } from "@/domains/patient";
import NationalNumber from "@/components/demographics/NationalNumber";
import FormattedDate from "@/components/date/Date";
import { Skeleton, Text } from "@mantine/core";

/**
 * Demographics Props
 */
type Props = {
  /** Patient data to display (undefined if not loaded) */
  patient?: Patient;
  /** Whether patient data is currently loading */
  isLoading?: boolean;
};

/**
 * Demographics
 *
 * Renders compact patient demographics with:
 * - Patient name (bold, large)
 * - Age, gender, DOB (formatted)
 * - National number (NHS format)
 * - Loading skeleton state
 * - Returns null if no patient data
 *
 * @param props - Component props
 * @returns Demographics summary or skeleton/null
 */
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
        {patient.dob && <FormattedDate date={patient.dob} span inherit />}
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
