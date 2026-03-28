/**
 * Top Ribbon Component Module
 *
 * Top navigation bar displaying Quill branding, patient information,
 * and mobile hamburger menu. Adapts layout based on screen width
 * and patient data loading state.
 */

import type { Patient } from "@/domains/patient";
import NationalNumber from "@/components/data/NationalNumber";
import FormattedDate from "@/components/data/Date";
import SearchField from "@/components/search";
import QuillName from "@components/images/QuillName";
import ProfilePic from "@components/profile-pic/ProfilePic";
import { Group, Skeleton, Text } from "@mantine/core";
import BurgerButton from "@/components/button/BurgerButton";
import { Link } from "react-router-dom";
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
  /** Callback when patient demographics are clicked */
  onPatientClick?: () => void;
  /** Callback when patient demographics are double-clicked */
  onPatientDoubleClick?: () => void;
  /** When true, hides burger, patient info, and search — shows only branding */
  examMode?: boolean;
};

/**
 * Skeleton placeholder shown while patient data loads
 */
function RibbonSkeleton({ isNarrow = false }: { isNarrow?: boolean }) {
  return (
    <Group gap="md" wrap="nowrap" w="100%" align="center">
      {!isNarrow && <Skeleton circle h={48} w={48} />}
      <Skeleton h={30} radius="sm" style={{ flex: 1 }} />
    </Group>
  );
}

function patientDetailsLong(patient: Patient, fontSize: string) {
  return (
    <Group gap="md" wrap="nowrap" align="center">
      <ProfilePic
        givenName={patient.givenName}
        familyName={patient.familyName}
        gradientIndex={patient.gradientIndex}
        size="md"
      />
      <Group gap="sm" wrap="nowrap">
        <Text fw={700} size="lg" style={{ fontSize }}>
          {patient.name}
        </Text>
        {patient.dob && (
          <Text size="lg" style={{ fontSize }} component="span">
            DOB: <FormattedDate date={patient.dob} />
          </Text>
        )}
        {typeof patient.age === "number" && (
          <Text size="lg" style={{ fontSize }}>
            Age: {patient.age}
          </Text>
        )}
        {patient.sex && (
          <Text size="lg" style={{ fontSize }}>
            Sex: {patient.sex}
          </Text>
        )}
        {patient.nationalNumber && (
          <Text size="lg" style={{ fontSize }}>
            <NationalNumber
              nationalNumber={patient.nationalNumber}
              nationalNumberSystem={patient.nationalNumberSystem}
            />
          </Text>
        )}
      </Group>
    </Group>
  );
}

function patientDetailsShort(patient: Patient, fontSize: string) {
  return (
    <Group gap="sm" wrap="wrap" align="center" justify="center">
      <Text fw={700} size="lg" style={{ fontSize }} component="span">
        {patient.name}
      </Text>
      {patient.dob && (
        <Text size="lg" style={{ fontSize }} component="span">
          <FormattedDate date={patient.dob} />
        </Text>
      )}
      {typeof patient.age === "number" && (
        <Text size="lg" style={{ fontSize }} component="span">
          {patient.age} {patient.sex}
        </Text>
      )}
      {patient.nationalNumber && (
        <Text size="lg" style={{ fontSize }} component="span">
          <NationalNumber
            nationalNumber={patient.nationalNumber}
            nationalNumberSystem={patient.nationalNumberSystem}
          />
        </Text>
      )}
    </Group>
  );
}

export default function TopRibbon({
  onBurgerClick,
  patient,
  isLoading,
  navOpen = false,
  isNarrow = false,
  fontSize = "1.25rem",
  onPatientClick,
  onPatientDoubleClick,
  examMode = false,
}: Props) {
  const showBrand = !isNarrow || examMode;

  if (examMode) {
    return (
      <div className={classes.cq}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            paddingTop: 3,
            marginLeft: "0.8rem",
          }}
        >
          <QuillName />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* This inner div is the query container */}
      <div className={classes.cq}>
        {/* left */}
        {isNarrow && (
          <div className={classes.left}>
            <BurgerButton navOpen={navOpen} onClick={onBurgerClick} />
          </div>
        )}

        {showBrand && (
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              paddingTop: 3,
              marginLeft: "0.8rem",
            }}
          >
            <QuillName />
          </Link>
        )}
        {/* middle: patient info */}
        <div className={classes.middle}>
          {isLoading ? (
            <RibbonSkeleton isNarrow={isNarrow} />
          ) : patient ? (
            <div
              onClick={onPatientClick}
              onDoubleClick={onPatientDoubleClick}
              style={{ cursor: "pointer" }}
            >
              {isNarrow
                ? patientDetailsShort(patient, fontSize)
                : patientDetailsLong(patient, fontSize)}
            </div>
          ) : null}
        </div>
        {/* right: search — hidden by @container when narrow */}
        {!isNarrow && (
          <div className={classes.right}>
            <SearchField />
          </div>
        )}
      </div>
    </>
  );
}
