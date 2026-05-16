/**
 * ModuleNav Component
 *
 * Sidebar navigation for the TeachingModuleMain landing page.
 * Shows the module title and links to the learning materials
 * and assessment sections, plus a back link to the teaching
 * dashboard.
 */

import { NavLink, Stack } from "@mantine/core";
import Divider from "@/components/divider/Divider";
import {
  IconArrowLeft,
  IconBook,
  IconChalkboardTeacher,
} from "@/components/icons/appIcons";
import { typographyTokens } from "@/theme";

export interface ModuleNavProps {
  /** Module title displayed at the top of the nav */
  moduleTitle: string;
  /** Called when "Learning materials" is clicked */
  onLearning: () => void;
  /** Called when "Assessment" is clicked */
  onAssessment: () => void;
  /** Called when the back link is clicked */
  onBack: () => void;
}

/** Icon size matching NavIcon "lg" (22px) */
const NAV_ICON_SIZE = 22;
/** Icon colour matching NavIcon */
const NAV_ICON_COLOUR = "var(--mantine-color-gray-6)";

const navLabelStyles = {
  label: {
    fontSize: "var(--mantine-font-size-md)",
    fontWeight: typographyTokens.fontWeights.body,
  },
};

export default function ModuleNav({
  moduleTitle,
  onLearning,
  onAssessment,
  onBack,
}: ModuleNavProps) {
  return (
    <Stack gap="xs" p="sm">
      <NavLink
        label={moduleTitle}
        leftSection={<span style={{ width: NAV_ICON_SIZE }} />}
        styles={{
          label: {
            fontSize: "var(--mantine-font-size-md)",
            fontWeight: typographyTokens.fontWeights.bold,
          },
        }}
        component="div"
      />

      <NavLink
        label="Learning materials"
        leftSection={<IconBook size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />}
        onClick={onLearning}
        styles={navLabelStyles}
      />

      <NavLink
        label="Assessment"
        leftSection={
          <IconChalkboardTeacher size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
        }
        onClick={onAssessment}
        styles={navLabelStyles}
      />

      <Divider my="xs" />

      <NavLink
        label="Back to main app"
        leftSection={
          <IconArrowLeft size={NAV_ICON_SIZE} color={NAV_ICON_COLOUR} />
        }
        onClick={onBack}
        styles={navLabelStyles}
      />
    </Stack>
  );
}
