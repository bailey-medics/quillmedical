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
import { Group, SimpleGrid, Skeleton, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/page-header";
import ActionCard from "@/components/action-card";
import AddButton from "@/components/button/AddButton";
import InboxButton from "@/components/passport/InboxButton";
import SpecialtyField from "@/components/passport/SpecialtyField";
import CompetencySummary from "@/components/passport/CompetencySummary";
import StateMessage from "@/components/message-cards/StateMessage";
import ErrorState from "@/components/error-state/ErrorState";
import {
  IconAlertTriangle,
  IconBook,
  IconCheck,
  IconDownload,
  IconFileText,
  IconPencil,
  IconPresentation,
} from "@/components/icons/appIcons";
import { layoutTokens } from "@/theme";
import { createPassport, fetchInbox, fetchMyPassport } from "@lib/passport";
import { entitlementWarning } from "@lib/passport/entitlementWarning";
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
    // First, because it is the answer to the question the passport
    // exists for: what has somebody been signed off to do. The others
    // are the evidence that leads to it.
    icon: <IconCheck />,
    title: "Sign-offs",
    subtitle: "What an assessor has signed, and what is still waiting.",
    label: "Open sign-offs",
    to: "/passport/sign-offs",
  },
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
  {
    icon: <IconDownload />,
    title: "Download",
    subtitle: "Take your record with you. It does not depend on Quill.",
    label: "Open download",
    to: "/passport/download",
  },
];

/**
 * The page title, with the way into the assessor's queue beside it.
 *
 * Beside the title rather than among the cards below, because those are
 * the holder's own record and this is not part of it: it is other
 * people's records waiting on this person's judgement. An external
 * assessor may have a queue and no passport at all.
 *
 * Drawn on every state of the page — error, no passport yet, and the
 * ordinary one — since somebody can be asked to assess a colleague
 * whether or not they have started a passport themselves.
 *
 * The plan records that "inbox" is the wrong name for the destination
 * and that the right one is still to be chosen; the label here will
 * change with it.
 */
function PassportHeader({
  waiting,
  onInbox,
}: {
  waiting: number;
  onInbox: () => void;
}) {
  return (
    <Group justify="space-between" align="center">
      <PageHeader title="My passport" />
      <InboxButton count={waiting} onClick={onInbox} />
    </Group>
  );
}

export function Component() {
  const navigate = useNavigate();
  const twoColumns = useMediaQuery(
    `(min-width: ${layoutTokens.actionCardTwoColumnMinWidth})`,
  );
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Distinct from `error`: the holder has no passport yet, which is the
  // ordinary state of everybody who has never pressed the button. It
  // was treated as a failed load until somebody opened the page on a
  // fresh account and was told to try again, which could never work.
  const [absent, setAbsent] = useState(false);
  // Starts true, because on the first render the answer is not known
  // yet. Without it the page fell through to the ordinary layout,
  // drew the action cards, and then swapped them for "you do not have
  // a passport yet" when the 404 arrived — a flash of somebody else's
  // page on the way to your own.
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // Asked before the passport is made, with nothing preselected: `null`
  // until answered, `[]` for Generic. Only orders the competency picker.
  const [specialties, setSpecialties] = useState<string[] | null>(null);
  // How many sign-off requests name this person as assessor. Fetched
  // separately from the passport because it is separate: an external
  // assessor has a queue and may have no passport at all, so a failed
  // passport load must not take the count with it.
  const [waiting, setWaiting] = useState(0);

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
        // Every outcome resolves the question, including the failure:
        // an error has its own branch below, and leaving this true
        // would hold the page on a skeleton for ever.
        .finally(() => {
          if (!isCancelled()) setLoading(false);
        }),
    [],
  );

  // No setState in the effect body: there is no error to clear before
  // the first fetch, and resetting one here would only cascade a
  // render. `handleCreate` does clear the error, and is an event
  // handler where that is fine.
  useEffect(() => {
    let cancelled = false;

    void applyResult(fetchMyPassport(), () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  // A failure here is silent on purpose. The count is a convenience
  // beside the title, and an error banner about it would sit above the
  // holder's own record complaining about somebody else's queue. The
  // button still works; it simply shows no number.
  useEffect(() => {
    let cancelled = false;

    fetchInbox()
      .then((items) => {
        if (!cancelled) setWaiting(items.length);
      })
      .catch(() => {
        /* no number rather than a wrong one */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = () => {
    if (specialties === null) return;

    setCreating(true);
    setError(null);

    createPassport(specialties)
      .then(() => applyResult(fetchMyPassport(), () => false))
      .catch(() => {
        setError("Your passport could not be created. Please try again.");
      })
      .finally(() => setCreating(false));
  };

  if (error) {
    return (
      <Stack gap="lg">
        <PassportHeader
          waiting={waiting}
          onInbox={() => navigate("/passport/inbox")}
        />
        <ErrorState message={error} />
      </Stack>
    );
  }

  // Until the fetch answers, neither "here is your passport" nor "you
  // do not have one" is known, and guessing shows somebody a page that
  // is about to be replaced.
  //
  // The header is drawn first and stays put, because it is common to
  // every branch below and its sign-off count comes from a separate
  // request: an assessor with a queue and no passport sees their
  // button immediately rather than after a round trip.
  //
  // The skeleton is shaped like the action cards it stands in for, so
  // the page settles rather than changes shape. A skeleton replaced by
  // something of a different size reads as a flicker of its own, which
  // is why `CompetencySummary` has none.
  if (loading) {
    return (
      <Stack gap="lg">
        <PassportHeader
          waiting={waiting}
          onInbox={() => navigate("/passport/inbox")}
        />
        <SimpleGrid cols={twoColumns ? 2 : 1}>
          {SECTIONS.map((section) => (
            <Skeleton
              key={section.to}
              height={layoutTokens.actionCardSkeletonHeight}
              radius="md"
            />
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  // A holder without a passport is told what one is before being asked
  // to start it, rather than shown an empty record.
  if (absent) {
    return (
      <Stack gap="lg">
        <PassportHeader
          waiting={waiting}
          onInbox={() => navigate("/passport/inbox")}
        />
        <StateMessage
          colour="update"
          icon={<IconFileText />}
          title="You do not have a passport yet"
          description={
            "You can create your Clinician Passport to manage your competencies" +
            " and track your progress over time."
          }
        />
        <SpecialtyField
          value={specialties}
          onChange={setSpecialties}
          required
        />
        <Group justify="flex-end">
          <AddButton
            label="Create my passport"
            onClick={handleCreate}
            disabled={creating || specialties === null}
          />
        </Group>
      </Stack>
    );
  }

  const warning = entitlementWarning(passport?.entitlement);

  return (
    <Stack gap="lg">
      <PassportHeader
        waiting={waiting}
        onInbox={() => navigate("/passport/inbox")}
      />
      {/* On the way in, not at the point of refusal. Finding out that
          the record has gone read-only half way through typing a
          reflection is the worst possible moment to learn it. */}
      {warning && (
        <StateMessage
          colour="warning"
          icon={<IconAlertTriangle />}
          title={warning.title}
          description={warning.description}
        />
      )}
      {/* The ways in come first, and the list of competencies after.
          Somebody opening their passport has come to record something
          or to chase a sign-off; what they are already competent at is
          something they know from their own practice and rarely need
          to look up. Putting the list on top made them scroll past
          what they know to reach what they came for. */}
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

      <CompetencySummary
        competencies={passport?.competencies ?? []}
        onSelect={(competencyId) =>
          navigate(`/passport/competency/${competencyId}`)
        }
      />
    </Stack>
  );
}
