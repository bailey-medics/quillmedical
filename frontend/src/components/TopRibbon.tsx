// src/components/TopRibbon.tsx
import { ActionIcon, Anchor, Box, Group, Text, TextInput } from "@mantine/core";
import { IconMenu2, IconSearch } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { Patient } from "./TopRibbon.types"; // or inline your Patient type

type Props = {
  onBurgerClick: () => void;
  isMobile: boolean;
  patient: Patient | null;
  showBurger: boolean; // <- NEW
};

export default function TopRibbon({
  onBurgerClick,
  isMobile,
  patient,
  showBurger,
}: Props) {
  return (
    <Box>
      <Group h={56} px="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {showBurger && (
            <ActionIcon
              variant="subtle"
              onClick={onBurgerClick}
              aria-label="Open navigation"
            >
              <IconMenu2 />
            </ActionIcon>
          )}

          <Anchor component={Link} to="/" fw={700} underline="never">
            Quill Medical
          </Anchor>
        </Group>

        {!isMobile && (
          <TextInput
            aria-label="Search"
            placeholder="Search…"
            rightSectionPointerEvents="none"
            rightSection={<IconSearch size={16} />}
            w={340}
          />
        )}
      </Group>

      {/* Demographics bar (always present area; blank if no patient) */}
      <Box
        px="md"
        py={10}
        style={{
          borderTop: "1px solid var(--mantine-color-gray-3)",
          borderBottom: "1px solid var(--mantine-color-gray-3)",
          background: "var(--mantine-color-gray-0)",
        }}
      >
        {patient ? (
          <Group gap="lg" wrap="wrap">
            <Text fw={700} size="lg">
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
          </Group>
        ) : (
          <div style={{ height: 20 }} />
        )}
      </Box>
    </Box>
  );
}
