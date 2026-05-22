/**
 * Organisation Features Page
 *
 * Admin page to enable/disable features on an organisation.
 * Toggles are managed by React Hook Form. Save requires confirmation
 * listing what will change.
 */

import { useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { Container, Group, Stack, Skeleton, Alert } from "@mantine/core";
import { Controller, useFormState } from "react-hook-form";
import { IconAlertCircle } from "@components/icons/appIcons";
import PageHeader from "@/components/page-header";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  ErrorMessage,
  Heading,
} from "@/components/typography";
import SolidSwitch from "@/components/form/SolidSwitch";
import DirtyFormNavigation from "@/components/warnings";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";

/** Known features that can be toggled on an organisation. */
const AVAILABLE_FEATURES: {
  key: string;
  label: string;
  description: string;
}[] = [
  {
    key: "teaching",
    label: "Teaching",
    description: "Assessments, question banks, and educator tools",
  },
  {
    key: "messaging",
    label: "Messaging",
    description: "Secure messaging between staff and patients",
  },
  {
    key: "letters",
    label: "Letters",
    description: "Clinical letter composition and management",
  },
];

interface FeatureOut {
  feature_key: string;
  enabled_at: string;
  enabled_by: number | null;
}

interface OrgSummary {
  id: number;
  name: string;
}

type FeatureFormValues = Record<string, boolean>;

function ConfirmContent({
  orgName,
  savedKeys,
}: {
  orgName: string;
  savedKeys: Set<string>;
}) {
  const { methods } = useFormContext();
  const values = methods.getValues() as FeatureFormValues;
  const changes = AVAILABLE_FEATURES.filter(
    (f) => savedKeys.has(f.key) !== values[f.key],
  );
  const hasDisables = changes.some((f) => !values[f.key]);

  return (
    <>
      You are about to make the following changes for <strong>{orgName}</strong>
      :
      <Stack gap={4} mt="xs" align="center">
        {changes.map((change) => (
          <BodyText key={change.key}>
            <strong>{change.label}</strong> —{" "}
            {values[change.key] ? "enable" : "disable"}
          </BodyText>
        ))}
      </Stack>
      {hasDisables && (
        <ErrorMessage>
          Disabling features will immediately remove access for all users in
          this organisation.
        </ErrorMessage>
      )}
    </>
  );
}

function FeatureFields({ orgId }: { orgId: string }) {
  const navigate = useNavigate();
  const { methods, formState } = useFormContext();
  const { isDirty } = useFormState({ control: methods.control });

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return (
    <>
      <Stack gap="md">
        <FormStatus />
        <BaseCard>
          <Stack gap="lg">
            <Heading>Available features</Heading>

            <BodyTextInline>
              You are about to make organisation-wide changes. Please do so with
              care. You will need to press &ldquo;Save changes&rdquo; below for
              these changes to take effect.
            </BodyTextInline>

            {AVAILABLE_FEATURES.map((feature) => (
              <Controller
                key={feature.key}
                name={feature.key}
                control={methods.control}
                render={({ field }) => (
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2}>
                      <BodyTextBold>{feature.label}</BodyTextBold>
                      <BodyText>{feature.description}</BodyText>
                    </Stack>

                    <SolidSwitch
                      checked={field.value as boolean}
                      onChange={field.onChange}
                      disabled={formState === "submitting"}
                      aria-label={`Toggle ${feature.label}`}
                    />
                  </Group>
                )}
              />
            ))}
          </Stack>
        </BaseCard>

        <SubmitButton
          onCancel={() => navigate(`/admin/organisations/${orgId}`)}
        />
      </Stack>

      <DirtyFormNavigation
        blocker={blocker}
        onProceed={() => methods.reset()}
      />
    </>
  );
}

export default function OrgFeaturesPage() {
  const { id } = useParams<{ id: string }>();
  const { reload } = useAuth();
  const [orgName, setOrgName] = useState<string>("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) {
        setError("No organisation ID provided");
        setLoading(false);
        return;
      }

      try {
        const [orgData, featuresData] = await Promise.all([
          api.get<OrgSummary>(`/organizations/${id}`),
          api.get<{ features: FeatureOut[] }>(`/organizations/${id}/features`),
        ]);
        setOrgName(orgData.name);
        const keys = new Set(featuresData.features.map((f) => f.feature_key));
        setSavedKeys(keys);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const defaultValues = useMemo(() => {
    const values: FeatureFormValues = {};
    for (const feature of AVAILABLE_FEATURES) {
      values[feature.key] = savedKeys.has(feature.key);
    }
    return values;
  }, [savedKeys]);

  async function handleSubmit(
    data: FeatureFormValues,
  ): Promise<FormSubmitResult> {
    const changes = AVAILABLE_FEATURES.filter(
      (f) => savedKeys.has(f.key) !== data[f.key],
    );

    try {
      await Promise.all(
        changes.map((change) =>
          api.put(`/organizations/${id}/features/${change.key}`, {
            enabled: data[change.key],
          }),
        ),
      );
      const newSaved = new Set(
        AVAILABLE_FEATURES.filter((f) => data[f.key]).map((f) => f.key),
      );
      setSavedKeys(newSaved);
      await reload();
      return {
        state: "success",
        message: { title: "Features updated" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to update features",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  if (loading) {
    return (
      <Container size="lg">
        <Stack gap="lg">
          <Skeleton height={60} />
          <Skeleton height={200} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg">
        <Alert
          icon={<Icon icon={<IconAlertCircle />} size="lg" />}
          title="Error loading features"
          color="var(--alert-color)"
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg">
      <Stack gap="lg">
        <PageHeader title="Features" />

        <Form<FeatureFormValues>
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
          submittingLabel="Saving…"
          disableWhenClean
          confirm={{
            title: "Confirm feature changes",
            acceptLabel: "Confirm",
            cancelLabel: "Go back",
            children: (
              <ConfirmContent orgName={orgName} savedKeys={savedKeys} />
            ),
          }}
        >
          <FeatureFields orgId={id!} />
        </Form>
      </Stack>
    </Container>
  );
}
