/**
 * PassportByCompetency Component
 *
 * The By competency view of a holder's passport: a table for each
 * framework they work to, then the parts of the passport that belong to no
 * one competency, as cards.
 *
 * The other view, By record, is the passport page as it was first built:
 * six cards, then every record newest first. A holder chooses between them
 * in Settings.
 *
 * **Takes its data as props and fetches nothing**, so Storybook can draw
 * the whole view and the page can hand it what it fetched. The two then
 * show the same thing.
 *
 * **CPD, certificates, reflections and download are cards at the foot.**
 * None belongs to a single competency, so none fits a row of the tables.
 * Download is last: taking a copy of the whole passport is rare, and does
 * not earn a place above the competencies.
 *
 * @example
 * ```tsx
 * <PassportByCompetency
 *   frameworks={passport.frameworks}
 *   competencies={detail.competencies}
 *   onSelectCompetency={(id) => navigate(`/passport/competencies/${id}`)}
 *   onOpen={navigate}
 * />
 * ```
 */

import { SimpleGrid, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import ActionCard from "@/components/action-card";
import {
  IconDownload,
  IconFileText,
  IconPencil,
  IconPresentation,
} from "@/components/icons/appIcons";
import { layoutTokens } from "@/theme";
import CompetencyFrameworkTable from "./CompetencyFrameworkTable";
import type { CompetencyState, FrameworkRef } from "@lib/passport";

/** The parts of the passport outside the competency tables. */
const OTHER_SECTIONS = [
  {
    icon: <IconPresentation />,
    title: "CPD",
    subtitle: "Continuing professional development, by appraisal period.",
    label: "Open CPD",
    to: "/passport/cpd",
  },
  {
    icon: <IconFileText />,
    title: "Certificates",
    subtitle: "Courses, qualifications and awards you are claiming.",
    label: "Open certificates",
    to: "/passport/certificates",
  },
  {
    icon: <IconPencil />,
    title: "Reflections",
    subtitle: "What you took from a case, a complaint or a significant event.",
    label: "Open reflections",
    to: "/passport/reflections",
  },
  {
    icon: <IconDownload />,
    title: "Download",
    subtitle: "Take your record with you. It does not depend on Quill.",
    label: "Open download",
    to: "/passport/download",
  },
];

export interface PassportByCompetencyProps {
  /** The frameworks the holder works to, in the order they chose them */
  frameworks: FrameworkRef[];
  /** Every competency the passport holds evidence for */
  competencies: CompetencyState[];
  /** Called with a competency's id when its row is chosen */
  onSelectCompetency?: (competencyId: string) => void;
  /** Called with a section's path when its card is chosen */
  onOpen?: (path: string) => void;
}

/**
 * PassportByCompetency
 *
 * Renders the framework tables, then the other sections as cards.
 */
export default function PassportByCompetency({
  frameworks,
  competencies,
  onSelectCompetency,
  onOpen,
}: PassportByCompetencyProps) {
  const twoColumns = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );

  return (
    <Stack gap="lg">
      {frameworks.map((framework) => (
        <CompetencyFrameworkTable
          key={framework.id}
          framework={framework}
          competencies={competencies}
          onSelect={onSelectCompetency}
        />
      ))}

      <SimpleGrid cols={twoColumns ? 2 : 1}>
        {OTHER_SECTIONS.map((section) => (
          <ActionCard
            key={section.to}
            icon={section.icon}
            title={section.title}
            subtitle={section.subtitle}
            buttonLabel={section.label}
            onClick={onOpen ? () => onOpen(section.to) : undefined}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
