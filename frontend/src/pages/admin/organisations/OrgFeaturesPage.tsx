/**
 * Organisation Features Page
 *
 * Admin page to enable/disable features on an organisation, or on a site:
 * a site may carry features of its own since 1 October 2026, so the
 * passport can be on for one team without its whole trust. `parentPath`
 * says which admin area the page sits in, for the way back.
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

/**
 * The passport's cover: a second switch, shown indented beneath the
 * passport one while that is on. It gives every staff member and trainee
 * here the paid right to add to their passport, so only an operator sees
 * or sets it.
 */
const PASSPORT_COVER = {
  key: "passport_write",
  label: "Cover members' writing",
  description:
    "Staff and trainees here can add to their passport, paid for by this place",
};

/** The switches this viewer may set, cover included for an operator. */
function trackedFeatures(canSetCover: boolean) {
  return canSetCover
    ? [...AVAILABLE_FEATURES, PASSPORT_COVER]
    : AVAILABLE_FEATURES;
}

type FeatureFormValues = Record<string, boolean>;

function ConfirmContent({
  orgName,
  savedKeys,
  canSetCover,
  coveredCount,
}: {
  orgName: string;
  savedKeys: Set<string>;
  canSetCover: boolean;
  /** How many people hold writing through this place's cover */
  coveredCount: number;
}) {
  const { methods } = useFormContext();
  const values = methods.getValues() as FeatureFormValues;
  const changes = trackedFeatures(canSetCover).filter(
    (f) => savedKeys.has(f.key) !== values[f.key],
  );
  const hasDisables = changes.some((f) => !values[f.key]);
  // Cover ends when it is switched off, and when the passport is.
  const endsCover =
    savedKeys.has(PASSPORT_COVER.key) &&
    (values[PASSPORT_COVER.key] === false || values.passport === false);

  return (
    <>
      You are about to make the following changes for <strong>{orgName}</strong>
      :
      <Stack gap={4} mt="xs" align="center">
        {changes.map((change) => (
          <BodyText key={change.key}>
            <strong>{change.label}</strong> –{" "}
            {values[change.key] ? "enable" : "disable"}
          </BodyText>
        ))}
      </Stack>
      {hasDisables && (
        <ErrorMessage>
          Disabling features will immediately remove access for everyone they
          reach here.
        </ErrorMessage>
      )}
      {endsCover && (
        <ErrorMessage>
          {coveredCount === 1
            ? "1 person will no longer be able to add to their passport."
            : `${coveredCount} people will no longer be able to add to their passport.`}{" "}
          That includes anyone who has since left.
        </ErrorMessage>
      )}
    </>
  );
}

function FeatureFields({
  orgId,
  parentPath,
  canSetCover,
  afterFeatures,
}: {
  orgId: string;
  parentPath: FeaturesParentPath;
  /** Whether the viewer may set the passport's cover */
  canSetCover: boolean;
  /** Shown between the feature switches and the buttons */
  afterFeatures?: ReactNode;
}) {
  const navigate = useNavigate();
  const { methods, formState } = useFormContext();
  const passportOnInForm = methods.watch("passport") === true;

  return (
    <Stack gap="md">
      <FormStatus />
      <BaseCard>
        <Stack gap="lg">
          <Heading>Available features</Heading>

          <BodyTextInline>
            You are about to change what everyone here can use. Please do so
            with care. You will need to press &ldquo;Save changes&rdquo; below
            for these changes to take effect.
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
                    onChange={(event) => {
                      field.onChange(event);
                      // The cover means nothing without the passport.
                      if (
                        feature.key === "passport" &&
                        canSetCover &&
                        !event.currentTarget.checked
                      ) {
                        methods.setValue(PASSPORT_COVER.key, false, {
                          shouldDirty: true,
                        });
                      }
                    }}
                    disabled={formState === "submitting"}
                    aria-label={`Toggle ${feature.label}`}
                  />
                </Group>
              )}
            />
          ))}

          {canSetCover && passportOnInForm && (
            <Controller
              name={PASSPORT_COVER.key}
              control={methods.control}
              render={({ field }) => (
                <Group justify="space-between" wrap="nowrap" pl="xl">
                  <Stack gap={2}>
                    <BodyTextBold>{PASSPORT_COVER.label}</BodyTextBold>
                    <BodyText>{PASSPORT_COVER.description}</BodyText>
                  </Stack>

                  <SolidSwitch
                    checked={field.value as boolean}
                    onChange={field.onChange}
                    disabled={formState === "submitting"}
                    aria-label={`Toggle ${PASSPORT_COVER.label}`}
                  />
                </Group>
              )}
            />
          )}
        </Stack>
      </BaseCard>

      {afterFeatures}

      <SubmitButton
        onCancel={() => navigate(`/admin/${parentPath}/${orgId}`)}
      />
    </Stack>
  );
}

/** The admin area a features page sits in. */
export type FeaturesParentPath = "organisations" | "sites";

export interface OrgFeaturesPageProps {
  /** Which admin area to return to. Defaults to organisations. */
  parentPath?: FeaturesParentPath;
}

export default function OrgFeaturesPage({
  parentPath = "organisations",
}: OrgFeaturesPageProps = {}) {
  const { id } = useParams<{ id: string }>();
  const { reload, state } = useAuth();
  // Cover gives away the paid half of the passport, so the API lets only
  // an operator switch it. Nobody else is shown the switch.
  const canSetCover =
    state.status === "authenticated" &&
    state.user.platform_role === "superadmin";
  // How many people hold writing through this place's cover
  const [coveredCount, setCoveredCount] = useState(0);
  const [orgName, setOrgName] = useState<string>("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The saved lead specialties; null until loaded
  const [leads, setLeads] = useState<string[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | undefined>();
  const passportOn = savedKeys.has("passport");
  const coverOn = savedKeys.has(PASSPORT_COVER.key);

  useEffect(() => {
    if (!id || !coverOn) return;
    let cancelled = false;
    orgUnits
      .passportCover(Number(id))
      .then((cover) => {
        if (!cancelled) setCoveredCount(cover.covered_count);
      })
      .catch(() => {
        // The count only words the warning; without it the dialog still
        // says that writing ends.
      });
    return () => {
      cancelled = true;
    };
  }, [id, coverOn]);

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
    for (const feature of trackedFeatures(canSetCover)) {
      values[feature.key] = savedKeys.has(feature.key);
    }
    return values;
  }, [savedKeys, canSetCover]);

  async function handleSubmit(
    data: FeatureFormValues,
  ): Promise<FormSubmitResult> {
    const tracked = trackedFeatures(canSetCover);
    const changes = tracked.filter((f) => savedKeys.has(f.key) !== data[f.key]);
    // The API refuses cover without the passport, and turning the
    // passport off ends cover itself. So the cover change is sent last
    // when it is being switched on, and is not sent at all when the
    // passport is being switched off in the same save.
    const coverChange = changes.find((c) => c.key === PASSPORT_COVER.key);
    const others = changes.filter((c) => c.key !== PASSPORT_COVER.key);
    const passportGoingOff = savedKeys.has("passport") && !data.passport;

    try {
      await Promise.all(
        others.map((change) =>
          orgUnits.setFeature(Number(id), change.key, data[change.key]),
        ),
      );
      if (coverChange && !passportGoingOff) {
        await orgUnits.setFeature(
          Number(id),
          coverChange.key,
          data[coverChange.key],
        );
      }
      const newSaved = new Set(
        tracked.filter((f) => data[f.key]).map((f) => f.key),
      );
      // Somebody who cannot set cover has no switch for it, but it is
      // still on here unless they just turned the passport off.
      if (!canSetCover && coverOn && data.passport) {
        newSaved.add(PASSPORT_COVER.key);
      }
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
          children: (
            <ConfirmContent
              orgName={orgName}
              savedKeys={savedKeys}
              canSetCover={canSetCover}
              coveredCount={coveredCount}
            />
          ),
        }}
      >
        <FeatureFields
          orgId={id!}
          parentPath={parentPath}
          canSetCover={canSetCover}
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
