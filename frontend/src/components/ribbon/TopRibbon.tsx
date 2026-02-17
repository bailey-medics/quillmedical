/**
 * Top Ribbon Component Module
 *
 * Top navigation bar displaying Quill branding, patient information,
 * and mobile hamburger menu. Adapts layout based on screen width
 * and patient data loading state.
 */

import type { Patient } from "@/domains/patient";
import NationalNumber from "@/components/demographics/NationalNumber";
import SearchField from "@/components/search/SearchFields";
import QuillName from "@components/images/QuillName";
import { ActionIcon, Group, Skeleton, Text } from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";
import classes from "./TopRibbon.module.scss";

/**
 * TopRibbon Props
 */
type Props = {
  /** Callback when hamburger menu is clicked (opens drawer) */
  onBurgerClick: () => void;
  /** Currently selected patient (null if none) */
  patient: Patient | null;
  /** Whether patient data is currently loading */
  isLoading: boolean;
  /** Whether the nav drawer/rail is currently open (for a11y) */
  navOpen?: boolean;
  /** Whether to use narrow/mobile layout */
  isNarrow?: boolean;
  /** Font size for patient details (default: "1.25rem") */
  fontSize?: string;
};

/**
 * Skeleton placeholder shown while patient data loads
 */
function RibbonSkeleton() {
  return (
    <Group gap="xs" wrap="nowrap" w="100%">
      <Skeleton h={30} radius="sm" style={{ flex: 1 }} />
    </Group>
  );
}

function patientDetailsLong(patient: Patient, fontSize: string) {
  return (
    <>
      <Text fw={700} size="sm" style={{ fontSize }}>
        {patient.name}
      </Text>
      {patient.dob && (
        <Text size="sm" style={{ fontSize }}>
          DOB: {patient.dob}
        </Text>
      )}
      {typeof patient.age === "number" && (
        <Text size="sm" style={{ fontSize }}>
          Age: {patient.age}
        </Text>
      )}
      {patient.sex && (
        <Text size="sm" style={{ fontSize }}>
          Sex: {patient.sex}
        </Text>
      )}
      {patient.nationalNumber && (
        <Text size="sm" style={{ fontSize }}>
          <NationalNumber
            nationalNumber={patient.nationalNumber}
            nationalNumberSystem={patient.nationalNumberSystem}
          />
        </Text>
      )}
    </>
  );
}

function patientDetailsShort(patient: Patient, fontSize: string) {
  return (
    <>
      <Text fw={700} size="sm" style={{ fontSize }}>
        {patient.name}
      </Text>
      {patient.dob && (
        <Text size="sm" style={{ fontSize }}>
          {patient.dob}
        </Text>
      )}
      {typeof patient.age === "number" && (
        <Text size="sm" style={{ fontSize }}>
          {" "}
          {patient.age} {patient.sex}
        </Text>
      )}
      {patient.nationalNumber && (
        <Text size="sm" style={{ fontSize }}>
          <NationalNumber
            nationalNumber={patient.nationalNumber}
            nationalNumberSystem={patient.nationalNumberSystem}
          />
        </Text>
      )}
    </>
  );
}

export default function TopRibbon({
  onBurgerClick,
  patient,
  isLoading,
  navOpen = false,
  isNarrow = false,
  fontSize = "1.25rem",
}: Props) {
  const showBrand = isLoading || !patient || (patient && !isNarrow);
  return (
    <>
      {/* This inner div is the query container */}
      <div className={classes.cq}>
        {/* left */}
        <div className={classes.left}>
          {isNarrow && (
            <ActionIcon
              variant="subtle"
              onClick={onBurgerClick}
              aria-controls="app-navbar"
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={navOpen}
              style={{ color: "#290661" }}
            >
              <IconMenu2 />
            </ActionIcon>
          )}
        </div>

        {showBrand && (
          <div style={{ display: "flex", alignItems: "center", paddingTop: 3 }}>
            <QuillName />
          </div>
        )}
        {/* middle: patient info */}
        <div className={classes.middle}>
          {isLoading ? (
            <RibbonSkeleton />
          ) : patient ? (
            <>
              {isNarrow
                ? patientDetailsShort(patient, fontSize)
                : patientDetailsLong(patient, fontSize)}
            </>
          ) : null}
        </div>
        {/* right: search — hidden by @container when narrow */}
        <div className={classes.right}>{!isNarrow && <SearchField />}</div>
      </div>
    </>
  );
}
