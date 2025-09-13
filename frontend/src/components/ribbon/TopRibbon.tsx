import {
  ActionIcon,
  Box,
  Group,
  Skeleton,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconMenu2, IconUserOff } from "@tabler/icons-react";
import SearchField from "../search/SearchField";
import classes from "./TopRibbon.module.css";

export type Patient = {
  id: string;
  name: string;
  dob?: string;
  age?: number;
  sex?: string;
  nhsNumber?: string;
};

type Props = {
  onBurgerClick: () => void;
  patient: Patient | null;
  isLoading: boolean;
  showBurger: boolean;
  /** Turn off sticky/fixed for Storybook so wrapper width can drive queries */
  sticky?: boolean;
};

function RibbonSkeleton() {
  return (
    <Group gap="xs" wrap="nowrap" w="100%">
      <Skeleton h={30} radius="sm" style={{ flex: 1 }} />
    </Group>
  );
}

function RibbonPlaceholder() {
  return (
    <Group gap="xs">
      <ThemeIcon size="md" radius="xl" color="gray">
        <IconUserOff size={16} />
      </ThemeIcon>
      <Text c="dimmed" size="sm">
        No patient selected
      </Text>
    </Group>
  );
}

export default function TopRibbon({
  onBurgerClick,
  patient,
  isLoading,
  showBurger,
  sticky = true,
}: Props) {
  return (
    <div className={sticky ? classes.wrapper : undefined}>
      {/* This inner div is the query container */}
      <div className={classes.cq}>
        {/* left */}
        <div className={classes.left}>
          {showBurger && (
            <ActionIcon
              variant="subtle"
              onClick={onBurgerClick}
              aria-label="Open navigation"
            >
              <IconMenu2 />
            </ActionIcon>
          )}
          <Box>
            {!patient && !isLoading && <Text fw={700}>Quill</Text>}
            {isLoading && (
              <Group gap="xs">
                <Text fw={700}>Quill</Text>
              </Group>
            )}
          </Box>
        </div>

        {/* middle: patient info */}
        <div className={classes.middle}>
          {isLoading ? (
            <RibbonSkeleton />
          ) : patient ? (
            <>
              <Text fw={700} size="sm">
                {patient.name}
              </Text>
              {patient.dob && <Text size="sm">DOB: {patient.dob}</Text>}
              {typeof patient.age === "number" && (
                <Text size="sm">Age: {patient.age}</Text>
              )}
              {patient.sex && <Text size="sm">Sex: {patient.sex}</Text>}
              {patient.nhsNumber && (
                <Text size="sm">NHS: {patient.nhsNumber}</Text>
              )}
            </>
          ) : (
            <RibbonPlaceholder />
          )}
        </div>

        {/* right: search — hidden by @container when narrow */}
        <div className={classes.right}>
          <SearchField />
        </div>
      </div>
    </div>
  );
}
