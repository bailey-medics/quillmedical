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
import { BodyText } from "@/components/typography";
import IconTextButton from "@/components/button/IconTextButton";
import NotFoundLayout from "@/components/layouts/NotFoundLayout";
import { MemberPracticePanel } from "@/components/member-practice";
import { orgUnits, type MemberPractice } from "@/domains/orgUnit";

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
      <PageHeader
        title={name}
        action={
          <IconTextButton
            icon="user"
            label="Their user account"
            onClick={() => navigate(`/admin/users/${memberId}`)}
          />
        }
      />
      <BodyText>At {practice.org_unit_name}</BodyText>
      <MemberPracticePanel
        practice={practice}
        onAuthorise={(competency) =>
          change(
            () =>
              orgUnits.authorisePractising(unitId, {
                user_id: memberId,
                competency,
              }),
            "Could not authorise that",
          )
        }
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
    </Stack>
  );
}
