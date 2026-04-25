/**
 * Demographics Component
 *
 * Compact patient demographics summary displaying name, age, gender, DOB,
 * and national number. Used in patient cards and list views. Provides
 * loading skeleton and null-safe rendering.
 */

import type { Patient } from "@/domains/patient";
import NationalNumber from "@/components/data/NationalNumber";
import FormattedDate from "@/components/data";
import { Skeleton } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";
import HeaderText from "@/components/typography/HeaderText";

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
        <Skeleton height={33} width="23rem" mt={10} mb={15} />
        <Skeleton height={20} width="20rem" />
      </div>
    );
  }

  if (!patient) {
    return null;
  }

  return (
    <div style={{ flex: 1 }}>
      <HeaderText>{patient.name}</HeaderText>
      <BodyText>
        {patient.dob && <FormattedDate date={patient.dob} />}
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
      </BodyText>
    </div>
  );
}
