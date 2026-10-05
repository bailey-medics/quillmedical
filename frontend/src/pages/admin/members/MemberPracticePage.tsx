/**
 * Member Practice Page
 *
 * One person at one org_unit: what they hold, and what they may practise
 * there. Reached by clicking somebody in an organisation's or a site's
 * staff table, and mounted under both, because both are org_units and the
 * page does not care which.
 *
 * A thin loader: everything that draws or changes anything is in
 * `MemberPracticePanel`, so the organisation and site versions share it.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Skeleton, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import { usePageMessage } from "@/components/page-message";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import {
  MemberPracticePanel,
  type PracticeChanges,
} from "@/components/member-practice";
import { orgUnits, type MemberPractice } from "@/domains/orgUnit";
import {
  MemberTeachingPanel,
  type EnrolmentChanges,
} from "@/components/teaching/member-teaching-panel";
import type { EnrolmentOrganisation } from "@/components/teaching/module-enrolment-editor";
import { teachingDoor, type ModuleAccess } from "@/domains/teachingDoor";

/**
 * Show and change what one member may practise at one org_unit.
 *
 * @returns The page
 */
export default function MemberPracticePage() {
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const navigate = useNavigate();
  const unitId = Number(id);
  const memberId = Number(userId);
  const valid = Number.isInteger(unitId) && Number.isInteger(memberId);

  const [practice, setPractice] = useState<MemberPractice | null>(null);
  const [loading, setLoading] = useState(valid);
  const [failed, setFailed] = useState(false);
  const { showMessage } = usePageMessage();
  const load = useCallback(async () => {
    if (!valid) return;
    try {
      setPractice(await orgUnits.memberPractice(unitId, memberId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [valid, unitId, memberId]);

  useEffect(() => {
    // Deferred rather than called straight, so no state is set while the
    // effect body runs. Matches `OrganisationAdminPage`.
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Run one change, then read the page again.
   *
   * Only a failure is said. Success shows on the page itself: a switch
   * moves, and a granted competency appears in the table switched on.
   */
  const change = useCallback(
    async (action: () => Promise<unknown>, failure: string) => {
      try {
        await action();
      } catch {
        showMessage({ variant: "error", title: failure });
      }
      await load();
    },
    [load, showMessage],
  );

  /**
   * Save the switches, then read the page again.
   *
   * Every change is tried, so one failure does not stop the rest, and the
   * page is reloaded whatever happened so it shows what was really saved.
   * Rejects when anything failed, for the form to say so.
   */
  const save = useCallback(
    async ({ authorise, withdraw }: PracticeChanges) => {
      const results = await Promise.allSettled([
        ...authorise.map((competency) =>
          orgUnits.authorisePractising(unitId, {
            user_id: memberId,
            competency,
          }),
        ),
        ...withdraw.map((competency) =>
          orgUnits.withdrawPractising(unitId, memberId, competency),
        ),
      ]);
      await load();
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(
          failed === results.length
            ? "None of the changes could be saved. Please try again."
            : `${failed} of ${results.length} changes could not be saved. The switches show what was.`,
        );
      }
    },
    [unitId, memberId, load],
  );

  // Teaching at this org_unit, where the organisation above it serves
  // modules and the viewer runs teaching. The API decides both: a
  // refusal, or an organisation serving nothing, leaves this null and
  // the page as it was.
  const [teaching, setTeaching] = useState<{
    organisation: EnrolmentOrganisation;
    access: ModuleAccess[];
  } | null>(null);

  const loadTeaching = useCallback(async () => {
    if (!valid) return;
    try {
      const served = await teachingDoor.modules(unitId);
      if (served.organisation_id === null || served.modules.length === 0) {
        setTeaching(null);
        return;
      }
      const { modules } = await teachingDoor.access(unitId, memberId);
      setTeaching({
        organisation: {
          id: served.organisation_id,
          name: served.organisation_name ?? "",
          modules: served.modules.map((module) => ({
            id: module.question_bank_id,
            title: module.title,
          })),
        },
        access: modules,
      });
    } catch {
      setTeaching(null);
    }
  }, [valid, unitId, memberId]);

  useEffect(() => {
    void (async () => {
      await loadTeaching();
    })();
  }, [loadTeaching]);

  // Each module is its own request, so one may fail after another has
  // landed. Taken off first, then enrolled: a module whose end date
  // changed is in both lists. A failure names the module, and the tick
  // stays as it was set, so saving again finishes the job; both routes
  // change nothing when asked twice.
  const saveEnrolment = useCallback(
    async ({ enrol, unenrol }: EnrolmentChanges) => {
      const title = (moduleId: string) =>
        teaching?.organisation.modules.find((m) => m.id === moduleId)?.title ??
        moduleId;
      const failed = new Set<string>();
      for (const moduleId of unenrol) {
        try {
          await teachingDoor.unenrol(unitId, memberId, moduleId);
        } catch {
          failed.add(title(moduleId));
        }
      }
      for (const { moduleId, endsOn } of enrol) {
        if (failed.has(title(moduleId))) continue;
        try {
          await teachingDoor.admit(
            unitId,
            memberId,
            [moduleId],
            // The whole of the day chosen.
            endsOn ? `${endsOn}T23:59:59Z` : null,
          );
        } catch {
          failed.add(title(moduleId));
        }
      }
      // Admitting may have given a competency and a place, which the
      // practice switches above show.
      await Promise.all([loadTeaching(), load()]);
      if (failed.size > 0) {
        throw new Error(
          `Could not save: ${[...failed].sort().join(", ")}. Please try again.`,
        );
      }
    },
    [teaching, unitId, memberId, loadTeaching, load],
  );

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={300} />
      </Stack>
    );
  }

  if (!valid || failed || !practice) {
    return <NotFoundLayout />;
  }

  const name = practice.full_name || practice.username;

  return (
    <Stack gap="lg">
      <PageHeader title={name} subtitle={`At ${practice.org_unit_name}`} />
      <MemberPracticePanel
        practice={practice}
        onOpenUserAccount={() => navigate(`/admin/users/${memberId}`)}
        // Back to the organisation or site this page sits under.
        onCancel={() => navigate("../..", { relative: "path" })}
        onSave={save}
        onWithdraw={(competency) =>
          change(
            () => orgUnits.withdrawPractising(unitId, memberId, competency),
            "Could not withdraw that",
          )
        }
        onGrantAndAuthorise={(competency) =>
          change(
            () => orgUnits.grantAndAuthorise(unitId, memberId, competency),
            "Could not grant that",
          )
        }
      />
      {teaching && (
        <MemberTeachingPanel
          organisation={teaching.organisation}
          access={teaching.access}
          onSave={saveEnrolment}
        />
      )}
    </Stack>
  );
}
