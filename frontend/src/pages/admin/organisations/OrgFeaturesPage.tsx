/**
 * Organisation Features Page
 *
 * Admin page to enable/disable features on an organisation.
 * Toggles are managed by React Hook Form. Save requires confirmation
 * listing what will change.
 *
 * While the passport is on, a second card sets the organisation's lead
 * passport specialties. It sits above the form's buttons, so they close
 * the page, but it saves as it changes rather than through them: it only
 * reorders a list and removes nobody's access, so it needs no
 * confirmation.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Group, Stack, Skeleton } from "@mantine/core";
import { Controller } from "react-hook-form";
import PageHeader from "@/components/page-header";
import BaseCard from "@/components/base-card/BaseCard";
import {
  BodyText,
  BodyTextBold,
  BodyTextInline,
  ErrorMessage,
  Heading,
} from "@/components/typography";
import SolidSwitch from "@/components/form/SolidSwitch";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { useAuth } from "@/auth/AuthContext";
import { orgUnits } from "@/domains/orgUnit";
import ErrorState from "@/components/error-state/ErrorState";
import PassportLeadSpecialtiesCard from "@/components/passport/PassportLeadSpecialtiesCard";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";

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
  {
    key: "passport",
    label: "Clinician passport",
    description:
      "Competency records signed off by a named assessor, held per clinician",
  },
];

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

function FeatureFields({
  orgId,
  afterFeatures,
}: {
  orgId: string;
  /** Shown between the feature switches and the buttons */
  afterFeatures?: ReactNode;
}) {
  const navigate = useNavigate();
  const { methods, formState } = useFormContext();

  return (
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

      {afterFeatures}

      <SubmitButton
        onCancel={() => navigate(`/admin/organisations/${orgId}`)}
      />
    </Stack>
  );
}

export default function OrgFeaturesPage() {
  const { id } = useParams<{ id: string }>();
  const { reload } = useAuth();
  const [orgName, setOrgName] = useState<string>("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The saved lead specialties; null until loaded
  const [leads, setLeads] = useState<string[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | undefined>();
  const passportOn = savedKeys.has("passport");

  useEffect(() => {
    if (!id || !passportOn) return;
    let cancelled = false;
    orgUnits
      .passportSpecialties(Number(id))
      .then((ids) => {
        if (!cancelled) setLeads(ids);
      })
      .catch(() => {
        if (!cancelled) {
          setLeadsError("The lead specialties could not be loaded.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, passportOn]);

  function saveLeads(next: string[]) {
    if (!id || leads === null) return;
    const previous = leads;

    // Shown at once, and put back if the save fails, so the card never
    // claims an order the organisation does not hold.
    setLeads(next);
    setLeadsError(undefined);

    orgUnits.setPassportSpecialties(Number(id), next).catch(() => {
      setLeads(previous);
      setLeadsError(
        "The lead specialties could not be saved. Please try again.",
      );
    });
  }

  useEffect(() => {
    async function fetchData() {
      if (!id) {
        setError("No organisation ID provided");
        setLoading(false);
        return;
      }

      try {
        // One request: an org_unit carries the features switched on there.
        const place = await orgUnits.get(Number(id));
        setOrgName(place.name);
        setSavedKeys(new Set(place.features));
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
          orgUnits.setFeature(Number(id), change.key, data[change.key]),
        ),
      );
      const newSaved = new Set(
        AVAILABLE_FEATURES.filter((f) => data[f.key]).map((f) => f.key),
      );
      setSavedKeys(newSaved);
      await reload();
      const summary = changes
        .map((c) => `${c.label} ${data[c.key] ? "enabled" : "disabled"}`)
        .join(", ");
      return {
        state: "success",
        message: { title: "Features updated", description: summary },
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
      <Stack gap="lg">
        <Skeleton height={60} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (error) {
    return <ErrorState title="Error loading features" message={error} />;
  }

  return (
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
          children: <ConfirmContent orgName={orgName} savedKeys={savedKeys} />,
        }}
      >
        <FeatureFields
          orgId={id!}
          afterFeatures={
            passportOn && (
              <PassportLeadSpecialtiesCard
                options={PASSPORT_SPECIALTIES}
                value={leads ?? []}
                onChange={saveLeads}
                disabled={leads === null}
                error={leadsError}
              />
            )
          }
        />
      </Form>
    </Stack>
  );
}
