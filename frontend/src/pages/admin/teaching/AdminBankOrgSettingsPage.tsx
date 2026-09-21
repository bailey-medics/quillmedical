/**
 * Admin Bank Organisation Settings Page
 *
 * Per-organisation settings for a question bank: live/closed toggle
 * and site registration.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Group, Skeleton, Stack } from "@mantine/core";
import { Controller } from "react-hook-form";
import { IconAlertCircle, IconArrowLeft } from "@/components/icons/appIcons";
import PageHeader from "@/components/page-header";
import IconButton from "@/components/button/IconButton";
import BaseCard from "@/components/base-card/BaseCard";
import SolidSwitch from "@/components/form/SolidSwitch";
import ActiveStatusBadge from "@/components/badge/ActiveStatusBadge";
import { StateMessage } from "@/components/message-cards";
import { Heading } from "@/components/typography";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { api } from "@/lib/api";
import type {
  AdminBankDetail,
  BankOrganisation,
} from "@/features/teaching/types";

interface BankOrgSettingsFormValues {
  isLive: boolean;
  siteRegistration: boolean;
}

interface SettingsFieldsProps {
  savedIsLive: boolean;
}

function SettingsFields({ savedIsLive }: SettingsFieldsProps) {
  const navigate = useNavigate();
  const { bankId } = useParams<{ bankId: string }>();
  const { methods } = useFormContext();

  return (
    <BaseCard>
      <Stack gap="md">
        <Group justify="space-between">
          <Heading>Exam status</Heading>
          <ActiveStatusBadge active={savedIsLive} />
        </Group>
        <FormStatus />
        <Controller
          name="isLive"
          control={methods.control}
          render={({ field }) => (
            <SolidSwitch
              label="Open for assessments"
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
            />
          )}
        />
        <Controller
          name="siteRegistration"
          control={methods.control}
          render={({ field }) => (
            <SolidSwitch
              label="Site registration"
              checked={field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
            />
          )}
        />

        <SubmitButton
          onCancel={() => navigate(`/admin/teaching/modules/${bankId}`)}
        />
      </Stack>
    </BaseCard>
  );
}

export default function AdminBankOrgSettingsPage() {
  const { bankId, orgId } = useParams<{ bankId: string; orgId: string }>();
  const navigate = useNavigate();

  const [bank, setBank] = useState<AdminBankDetail | null>(null);
  const [org, setOrg] = useState<BankOrganisation | null>(null);
  // Without both ids there is nothing to fetch, so the page does not begin
  // in a loading state and the effect below has nothing to do.
  const [loading, setLoading] = useState(Boolean(bankId && orgId));
  const [error, setError] = useState<string | null>(null);
  const [savedIsLive, setSavedIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    if (!bankId || !orgId) return;

    try {
      setError(null);
      const [bankData, orgsData] = await Promise.all([
        api.get<AdminBankDetail>(`/teaching/admin/banks/${bankId}`),
        api.get<BankOrganisation[]>(
          `/teaching/admin/banks/${bankId}/organisations`,
        ),
      ]);
      setBank(bankData);

      // The URL carries a place id now, so the row is matched on the
      // same thing rather than on the organisation id beside it.
      const thisOrg = orgsData.find((o) => o.org_unit_id === Number(orgId));
      if (!thisOrg) {
        setError("Organisation not found");
        return;
      }
      setOrg(thisOrg);
      setSavedIsLive(thisOrg.is_live);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bankId, orgId]);

  useEffect(() => {
    // Deferred rather than called straight, so no state is set while the
    // effect body runs. Matches the pattern in `SiteAdminPage`: the lint
    // rule analyses one function at a time and cannot see that `fetchData`
    // awaits before touching state, so the wrapper makes the deferral
    // explicit — and the floating promise with it.
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  async function handleSubmit(
    data: BankOrgSettingsFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.put(
        `/teaching/admin/banks/${bankId}/org-units/${orgId}/settings`,
        {
          is_live: data.isLive,
          site_registration: data.siteRegistration,
        },
      );
      setSavedIsLive(data.isLive);
      return {
        state: "success",
        message: { title: "Saved", description: "Settings updated" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Error saving settings",
          description:
            err instanceof Error ? err.message : "Failed to save settings",
        },
      };
    }
  }

  if (loading) {
    return (
      <Stack gap="lg">
        <Skeleton height={36} width={300} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </Stack>
    );
  }

  if (error || !bank || !org) {
    return (
      <StateMessage
        icon={<IconAlertCircle />}
        title="Error loading data"
        description={
          error ??
          (bankId && orgId ? "Not found" : "Missing required parameters")
        }
        colour="alert"
      />
    );
  }

  return (
    <Stack gap="lg">
      <Group gap="sm">
        <IconButton
          icon={<IconArrowLeft />}
          variant="subtle"
          onClick={() => navigate(`/admin/teaching/modules/${bankId}`)}
          aria-label="Back to bank detail"
        />
        <PageHeader title={`${org.organisation_name} – ${bank.title}`} />
      </Group>

      <Form<BankOrgSettingsFormValues>
        defaultValues={{
          isLive: org.is_live,
          siteRegistration: org.site_registration,
        }}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
        disableWhenClean
      >
        <SettingsFields savedIsLive={savedIsLive} />
      </Form>
    </Stack>
  );
}
