import type { Patient } from "@/domains/patient";
import SearchField from "@components//search/SearchField";
import QuillName from "@components/images/QuillName";
import { ActionIcon, Group, Skeleton, Text } from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";
import classes from "./TopRibbon.module.scss";

type Props = {
  onBurgerClick: () => void;
  patient: Patient | null;
  isLoading: boolean;
  /** Whether the nav drawer/rail is currently open (for a11y) */
  navOpen?: boolean;
  isNarrow?: boolean;
  fontSize?: number;
};

function RibbonSkeleton() {
  return (
    <Group gap="xs" wrap="nowrap" w="100%">
      <Skeleton h={30} radius="sm" style={{ flex: 1 }} />
    </Group>
  );
}

function patientDetailsLong(patient: Patient, fontSize: number) {
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
      {patient.nhsNumber && (
        <Text size="sm" style={{ fontSize }}>
          NHS: {patient.nhsNumber}
        </Text>
      )}
    </>
  );
}

function patientDetailsShort(patient: Patient, fontSize: number) {
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
          {patient.age}
          {patient.sex}
        </Text>
      )}
      {patient.nhsNumber && (
        <Text size="sm" style={{ fontSize }}>
          {patient.nhsNumber}
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
  fontSize = 20,
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
