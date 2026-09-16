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

import { useCallback, useEffect, useState } from "react";
import { Group, SimpleGrid, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import ActionCard from "@/components/action-card";
import AddButton from "@/components/button/AddButton";
import CompetencySummary from "@/components/passport/CompetencySummary";
import PassportExportButtons from "@/components/passport/PassportExportButtons";
import StateMessage from "@/components/message-cards/StateMessage";
import ErrorState from "@/components/error-state/ErrorState";
import {
  IconBook,
  IconFileText,
  IconPencil,
  IconPresentation,
} from "@/components/icons/appIcons";
import { layoutTokens } from "@/theme";
import { createPassport, fetchMyPassport } from "@lib/passport";
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
  // Distinct from `error`: the holder has no passport yet, which is the
  // ordinary state of everybody who has never pressed the button. It
  // was treated as a failed load until somebody opened the page on a
  // fresh account and was told to try again, which could never work.
  const [absent, setAbsent] = useState(false);
  const [creating, setCreating] = useState(false);

  /**
   * Apply one fetch's outcome to state.
   *
   * Shared by the initial load and the reload after creating, because
   * the two differ only in what happens before the request — not in how
   * the answer is read. `cancelled` is passed in rather than closed
   * over so the effect can still abandon its own in-flight request.
   */
  const applyResult = useCallback(
    (promise: Promise<PassportDetail>, isCancelled: () => boolean) =>
      promise
        .then((detail) => {
          if (isCancelled()) return;
          setPassport(detail);
          setAbsent(false);
        })
        .catch((err: unknown) => {
          if (isCancelled()) return;

          // 404 is the backend saying "you do not have one yet", not
          // that anything went wrong. Anything else is a real failure.
          if ((err as { status?: number })?.status === 404) {
            setAbsent(true);
            return;
          }

          setError("Your passport could not be loaded. Please try again.");
        })
        .finally(() => {
          if (!isCancelled()) setLoading(false);
        }),
    [],
  );

  // No setState in the effect body: the initial `loading` is already
  // true and there is no error to clear, so resetting either here would
  // only cascade a render. `handleCreate` does need the reset, and is
  // an event handler where that is fine.
  useEffect(() => {
    let cancelled = false;

    void applyResult(fetchMyPassport(), () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  const handleCreate = () => {
    setCreating(true);
    setError(null);

    createPassport()
      .then(() => {
        setLoading(true);
        return applyResult(fetchMyPassport(), () => false);
      })
      .catch(() => {
        setError("Your passport could not be created. Please try again.");
      })
      .finally(() => setCreating(false));
  };

  if (error) {
    return (
      <Stack gap="lg">
        <PageHeader title="My passport" />
        <ErrorState message={error} />
      </Stack>
    );
  }

  // Deliberately before the loading check has anything to show: a
  // holder without a passport should be told what one is before being
  // asked to start it, not shown an empty record.
  if (absent) {
    return (
      <Stack gap="lg">
        <PageHeader title="My passport" />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="You do not have a passport yet"
          description={
            "A passport is your own record of what you have been signed " +
            "off to do, who assessed you, and the evidence behind it. It " +
            "travels with you between employers, and only you can add to " +
            "it."
          }
        />
        <Group justify="flex-end">
          <AddButton
            label="Create my passport"
            onClick={handleCreate}
            disabled={creating}
          />
        </Group>
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
