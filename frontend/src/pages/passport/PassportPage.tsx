/**
 * Passport Page
 *
 * The holder's own passport: every competency they hold evidence for.
 *
 * Thin composition, as the plan asks — the components carry the
 * judgements about what may and may not be shown, and this page fetches
 * and arranges them.
 *
 * Exports `Component` rather than a default, because React Router's
 * `lazy` looks for that name. See the route definition in `main.tsx`.
 */

import { useEffect, useState } from "react";
import { SimpleGrid, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import ActionCard from "@/components/action-card";
import CompetencySummary from "@/components/passport/CompetencySummary";
import PassportExportButtons from "@/components/passport/PassportExportButtons";
import ErrorState from "@/components/error-state/ErrorState";
import {
  IconBook,
  IconFileText,
  IconPencil,
  IconPresentation,
} from "@/components/icons/appIcons";
import { layoutTokens } from "@/theme";
import { fetchMyPassport } from "@lib/passport";
import type { PassportDetail } from "@lib/passport";

/**
 * The rest of the passport, which nothing else links to.
 *
 * The side navigation has one Passport entry and it points here, so
 * without these a holder could not reach their own logbook or CPD
 * record at all — the pages existed and were addressable only by typing
 * the URL.
 */
const SECTIONS = [
  {
    icon: <IconBook />,
    title: "Logbook",
    subtitle: "Procedures you have performed, against a competency.",
    label: "Open logbook",
    to: "/passport/logbook",
  },
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
    subtitle: "Yours alone — no assessor or administrator can read them.",
    label: "Open reflections",
    to: "/passport/reflections",
  },
];

export function Component() {
  const navigate = useNavigate();
  const twoColumns = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMyPassport()
      .then((detail) => {
        if (!cancelled) setPassport(detail);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Your passport could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Stack gap="lg">
        <PageHeader title="My passport" />
        <ErrorState message={error} />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="My passport" />
      <CompetencySummary
        competencies={passport?.competencies ?? []}
        isLoading={loading}
        onSelect={(competencyId) =>
          navigate(`/passport/competency/${competencyId}`)
        }
      />

      <SimpleGrid cols={twoColumns ? 2 : 1}>
        {SECTIONS.map((section) => (
          <ActionCard
            key={section.to}
            icon={section.icon}
            title={section.title}
            subtitle={section.subtitle}
            buttonLabel={section.label}
            onClick={() => navigate(section.to)}
          />
        ))}
      </SimpleGrid>

      {/* Only once there is a passport to export. Offering a download
          before one exists would hand somebody an empty file and call it
          their record. */}
      {passport && (
        <PassportExportButtons passportId={passport.passport.passport_id} />
      )}
    </Stack>
  );
}
