/**
 * Safety Case Page
 *
 * One safety case: its title and status, then six cards, one for each
 * part of the case file. The cards are the only way into those pages,
 * as the passport landing page is for the passport's sections.
 *
 * Part of the safety mock-up, which has no backend; see
 * docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `routes.tsx`.
 */

import { SimpleGrid, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import ActionCard from "@/components/action-card";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import SafetyStatusBadge from "@/components/safety/SafetyStatusBadge";
import { BodyText } from "@/components/typography";
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertTriangle,
  IconFileText,
  IconShieldCheck,
  IconUser,
} from "@/components/icons/appIcons";
import { layoutTokens } from "@/theme";
import { openHazardCount, type SafetyCaseDetail } from "@lib/safety";
import { useSafetyCase } from "./useSafetyCase";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The six cards, in the order the plan asks for. */
function sections(safetyCase: SafetyCaseDetail) {
  const signed = safetyCase.sign_off.filter((item) => item.signed_on).length;
  return [
    {
      icon: <IconFileText />,
      title: "Documentation",
      subtitle: `${plural(safetyCase.documents.length, "document")} in the case file.`,
      label: "Open documentation",
      segment: "documentation",
    },
    {
      icon: <IconAlertTriangle />,
      title: "Hazards",
      subtitle: `${plural(openHazardCount(safetyCase), "open hazard")} of ${safetyCase.hazards.length} in the log.`,
      label: "Open hazard log",
      segment: "hazards",
    },
    {
      icon: <IconAlertCircle />,
      title: "Incidents",
      subtitle: `${plural(safetyCase.incidents.length, "incident")} recorded against this case.`,
      label: "Open incidents",
      segment: "incidents",
    },
    {
      icon: <IconUser />,
      title: "Officers",
      subtitle: `Clinical safety officer: ${safetyCase.clinical_safety_officer}.`,
      label: "Open officers",
      segment: "officers",
    },
    {
      icon: <IconShieldCheck />,
      title: "Compliance sign-off",
      subtitle: `${signed} of ${safetyCase.sign_off.length} sections signed.`,
      label: "Open sign-off",
      segment: "sign-off",
    },
    {
      icon: <IconAdjustmentsHorizontal />,
      title: "Placeholders",
      subtitle: `${plural(safetyCase.placeholders.length, "value")} substituted into every document.`,
      label: "Open placeholders",
      segment: "placeholders",
    },
  ];
}

export function Component() {
  const navigate = useNavigate();
  const safetyCase = useSafetyCase();
  const twoColumns = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );

  if (!safetyCase) {
    return <NotFoundLayout />;
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title={safetyCase.title}
        action={<SafetyStatusBadge status={safetyCase.status} />}
        actionAlign="center"
      />
      <BodyText c="dimmed">
        {safetyCase.system}, assessed against {safetyCase.standard}.
      </BodyText>
      <SimpleGrid cols={twoColumns ? 2 : 1}>
        {sections(safetyCase).map((section) => (
          <ActionCard
            key={section.segment}
            icon={section.icon}
            title={section.title}
            subtitle={section.subtitle}
            buttonLabel={section.label}
            onClick={() =>
              navigate(`/safety/${safetyCase.id}/${section.segment}`)
            }
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
