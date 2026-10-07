/**
 * User Info Update Page
 *
 * Multi-step form for creating or editing a user with:
 * - Step 1: Basic details (name, email, username, base profession)
 * - Step 2: Organisation/site assignment
 * - Step 3: Competency editor (add/remove competencies)
 * - Step 4: Practice (where each competency may be used), for a viewer
 *   who may set it
 * - Then platform role, review and confirmation
 *
 * @module UserInfoUpdatePage
 */

// The standard page pattern: a plain Stack, with the main layout setting
// the width. This page used to wrap itself in a padded, 900px box, which
// sat its title lower and its content narrower than every other page.

import { Box, Group, Stack, Alert, Loader, Center } from "@mantine/core";
import { useState, useEffect, useRef } from "react";
import {
  useNavigate,
  useBlocker,
  useParams,
  useSearchParams,
} from "react-router-dom";
import BaseCard from "@/components/base-card/BaseCard";
import TextField from "@/components/form/TextField";
import PasswordField from "@/components/form/PasswordField";
import SelectField from "@/components/form/SelectField";
import MultiSelectField from "@/components/form/MultiSelectField";
import {
  BodyText,
  BodyTextInline,
  BodyTextBold,
  Heading,
} from "@/components/typography";
import CompetencyBadge from "@/components/badge/CompetencyBadge";
import { usePageMessage } from "@/components/page-message";
import MultiStepForm, {
  type StepConfig,
  type StepContentProps,
} from "@/components/multi-step-form";
import DirtyFormNavigation from "@/components/warnings";
import PageHeader from "@/components/page-header";
import type { BaseProfessionId, CompetencyId, Competency } from "@/types/cbac";
import { getBaseProfessionDetails, ACTIVE_COMPETENCIES } from "@/types/cbac";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";
import {
  useGrantScope,
  useHasAnyCompetency,
  useHasCompetency,
} from "@/lib/cbac/hooks";
import competenciesData from "@/generated/competencies.json";
import baseProfessionsData from "@/generated/base-professions.json";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import PlatformRoleBadge, {
  type PlatformRole,
} from "@/components/badge/PlatformRoleBadge";
import ErrorState from "@/components/error-state/ErrorState";
import {
  orgUnits,
  typeCanHoldCompetencies,
  type OrgUnit,
} from "@/domains/orgUnit";
import {
  PracticeByPlaceEditor,
  type PracticeByPlace,
  type PracticePlace,
} from "@/components/member-practice";
import { competencyName } from "@/components/member-practice/competencyRows";
import { ErrorMessage } from "@/components/typography";
import {
  ModuleEnrolmentEditor,
  type EnrolmentByOrganisation,
  type EnrolmentOrganisation,
} from "@/components/teaching/module-enrolment-editor";

/**
 * An organisation and the org_units inside it, all in place ids.
 *
 * Organisations and the org_units inside them are rows in one table, so
 * there is one kind of id here. There used to be two, counted against
 * two tables, and the form was the last thing still telling them apart.
 */
interface OrgOption {
  id: number;
  name: string;
  sites: { id: number; name: string }[];
  /**
   * Set on the one group holding sites whose organisation the viewer
   * cannot see: somebody who runs a site without running its trust. It
   * is not an organisation to choose, and its sites go by their own
   * name alone.
   */
  unseen?: true;
}

/** The organisations among *options* that can themselves be chosen. */
function seenOrganisations(options: OrgOption[]): OrgOption[] {
  return options.filter((option) => !option.unseen);
}

/** What a site is called in a list: under its organisation where known. */
function siteLabel(org: OrgOption, site: { name: string }): string {
  return org.unseen ? site.name : `${org.name} - ${site.name}`;
}

/**
 * User form data state
 */
interface UserFormData {
  name: string;
  email: string;
  username: string;
  password: string;
  baseProfession: BaseProfessionId | "";
  additionalCompetencies: CompetencyId[];
  removedCompetencies: CompetencyId[];
  platformRole: PlatformRole;
  /**
   * Every org_unit the person belongs to, organisations included.
   *
   * One list, because the backend now takes one. The two controls on
   * screen are a view of it: one offers the organisations, the other the
   * org_units inside them.
   */
  orgUnitIds: string[];
  /**
   * What is switched on in the Practice step, by org_unit id. Kept as
   * the switches were left: what is shown and sent is narrowed to the
   * org_units and competencies the earlier steps now hold, by
   * `practiceToSend`.
   */
  practising: PracticeByPlace;
  /**
   * What is ticked in the Enrolment step, by organisation and module,
   * with each tick's end date. Kept as the ticks were left, and
   * narrowed by `enrolmentsToSend` to the organisations the earlier
   * steps still put them at.
   */
  enrolments: EnrolmentByOrganisation;
}

/** A `YYYY-MM-DD` day as it is read aloud: "1 March 2027". */
function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** The two competencies a teaching learner needs, by id. */
const LEARNER_COMPETENCIES = [
  "view_teaching_results",
  "take_teaching_modules",
] as const;

/**
 * A teaching organisation the person is being put at, for the Enrolment
 * step: what it serves, and which of their org_units sit under it.
 */
interface TeachingOrganisation extends EnrolmentOrganisation {
  /** The chosen org_units that belong to it, itself included */
  orgUnitIds: number[];
}

/**
 * The enrolments as they stand now, for showing and for sending:
 * narrowed to the organisations still chosen and the modules each
 * serves. So taking somebody out of an organisation drops the ticks
 * that hung on it, without the earlier steps having to know.
 */
function enrolmentsToSend(
  formData: UserFormData,
  organisations: TeachingOrganisation[],
): EnrolmentByOrganisation {
  const result: EnrolmentByOrganisation = {};
  for (const organisation of organisations) {
    const served = new Set(organisation.modules.map((module) => module.id));
    result[organisation.id] = Object.fromEntries(
      Object.entries(formData.enrolments[organisation.id] ?? {}).filter(
        ([moduleId]) => served.has(moduleId),
      ),
    );
  }
  return result;
}

/**
 * The competencies the person holds, or will once the form is saved:
 * what the profession gives, with the two lists from the Competencies
 * step applied. The same sum the server does.
 */
function heldCompetencies(formData: UserFormData): string[] {
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;
  const removed = new Set<string>(formData.removedCompetencies);
  return [
    ...new Set<string>([
      ...(profession?.base_competencies ?? []),
      ...formData.additionalCompetencies,
    ]),
  ].filter((id) => !removed.has(id));
}

/**
 * The org_units the Practice step shows: the ones the person is being
 * put at, that the viewer can name. One the viewer cannot see has no
 * name to show, and is left out of what is sent, so the server leaves
 * its practice alone.
 */
function practicePlaces(
  formData: UserFormData,
  placesById: Map<number, OrgUnit>,
): PracticePlace[] {
  return formData.orgUnitIds
    .map((id) => placesById.get(Number(id)))
    .filter((place): place is OrgUnit => place !== undefined)
    .map((place) => ({ id: place.id, name: place.name, type: place.type }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The practice choices as they stand now, for showing and for sending.
 *
 * The switches are kept as they were left, and narrowed here: to the
 * org_units still chosen, and to the competencies still held. So going
 * back and taking an org_unit or a competency away drops the practice
 * that hung on it, without the earlier steps having to know.
 */
function practiceToSend(
  formData: UserFormData,
  places: PracticePlace[],
): PracticeByPlace {
  const held = new Set(heldCompetencies(formData));
  const result: PracticeByPlace = {};
  for (const place of places) {
    // Nobody practises at a room; the server refuses a row there.
    if (!typeCanHoldCompetencies(place.type)) continue;
    result[place.id] = (formData.practising[place.id] ?? []).filter((id) =>
      held.has(id),
    );
  }
  return result;
}

/**
 * Step 1: Basic details
 */
function Step1BasicDetails({
  formData,
  setFormData,
  errors,
  isEditMode = false,
}: Omit<StepContentProps, "nextStep" | "prevStep" | "onCancel"> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  errors: Record<string, string>;
  isEditMode?: boolean;
}) {
  const isClinical = import.meta.env.VITE_CLINICAL_SERVICES_ENABLED !== "false";

  // Only what the viewer may give, plus the person's current profession
  // so an edit still shows it. A teaching admin is offered the teaching
  // professions; the API refuses anything else.
  const { mayAssignProfession } = useGrantScope();

  const professionOptions = baseProfessionsData.base_professions
    .filter((p) => isClinical || !p.requires_clinical_services)
    .filter(
      (p) => mayAssignProfession(p.id) || p.id === formData.baseProfession,
    )
    .map((p) => ({
      value: p.id,
      label: p.display_name,
    }));

  return (
    <Stack gap="md">
      <Heading>Basic details</Heading>
      <BodyText>
        Enter the user's basic information and select their base profession.
      </BodyText>

      <TextField
        label="Full name"
        placeholder="Dr Jane Smith"
        required
        value={formData.name}
        onChange={(e) =>
          setFormData({ ...formData, name: e.currentTarget.value })
        }
        error={errors.name}
      />

      <TextField
        label="Email"
        placeholder="jane.smith@example.com"
        required
        type="email"
        autoComplete="off"
        value={formData.email}
        onChange={(e) =>
          setFormData({ ...formData, email: e.currentTarget.value })
        }
        error={errors.email}
      />

      <TextField
        label="Username"
        placeholder="janesmith"
        required
        autoComplete="off"
        value={formData.username}
        onChange={(e) =>
          setFormData({ ...formData, username: e.currentTarget.value })
        }
        error={errors.username}
      />

      <PasswordField
        label={isEditMode ? "New password (optional)" : "Initial password"}
        placeholder={
          isEditMode
            ? "Leave blank to keep current password"
            : "Must be at least 8 characters"
        }
        required={!isEditMode}
        autoComplete="new-password"
        value={formData.password}
        onChange={(e) =>
          setFormData({ ...formData, password: e.currentTarget.value })
        }
        error={errors.password}
        description={
          isEditMode
            ? "Only enter a new password if you want to change it"
            : undefined
        }
      />

      <SelectField
        label="Base profession"
        placeholder="Select base profession"
        data={professionOptions}
        required
        value={formData.baseProfession}
        onChange={(value) => {
          setFormData({
            ...formData,
            baseProfession: value as BaseProfessionId,
          });
        }}
        error={errors.baseProfession}
        searchable
      />
    </Stack>
  );
}

/**
 * Step 2: Organisation/Site
 */
function Step2Organisation({
  formData,
  setFormData,
  organisations,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  organisations: OrgOption[];
}) {
  const orgOptions = seenOrganisations(organisations).map((o) => ({
    value: String(o.id),
    label: o.name,
  }));

  const siteOptions = organisations.flatMap((org) =>
    org.sites.map((s) => ({
      value: String(s.id),
      label: siteLabel(org, s),
    })),
  );

  // Two controls over one list. Which control an org_unit belongs in is
  // decided by what it is, not by the person having put it there.
  const validOrgIds = new Set(orgOptions.map((o) => o.value));
  const validSiteIds = new Set(siteOptions.map((s) => s.value));
  const visibleOrgIds = formData.orgUnitIds.filter((id) => validOrgIds.has(id));
  const visibleSiteIds = formData.orgUnitIds.filter((id) =>
    validSiteIds.has(id),
  );

  /** Replace one control's share of the list, leaving the rest alone. */
  function replaceShare(offered: Set<string>, chosen: string[]) {
    setFormData({
      ...formData,
      orgUnitIds: [
        ...formData.orgUnitIds.filter((id) => !offered.has(id)),
        ...chosen,
      ],
    });
  }

  return (
    <Stack gap="md">
      <Heading>Organisation/site</Heading>
      <BodyText>
        Optionally assign this user to an organisation and/or a site.
      </BodyText>

      <MultiSelectField
        label="Organisation"
        description="Only add user here if they require organisation access (this is not needed for 'Teaching delegates')"
        placeholder="Select organisations (optional)"
        data={orgOptions}
        value={visibleOrgIds}
        onChange={(value) => replaceShare(validOrgIds, value)}
        searchable
      />

      <MultiSelectField
        label="Site"
        description="Teaching delegates normally only need site access"
        placeholder="Select sites (optional)"
        data={siteOptions}
        value={visibleSiteIds}
        onChange={(value) => replaceShare(validSiteIds, value)}
        searchable
      />
    </Stack>
  );
}

/**
 * Step 3: Competency Editor
 */
function Step2Competencies({
  formData,
  setFormData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
}) {
  // Current only. The lookups further down still read the whole
  // catalogue, because a competency already granted has to keep
  // rendering its name after it is retired.
  //
  // Only what the viewer may grant or remove. A competency already
  // chosen stays listed so the field still shows it; the API refuses a
  // change to it.
  const { mayGrant } = useGrantScope();
  const chosen = new Set<string>([
    ...formData.additionalCompetencies,
    ...formData.removedCompetencies,
  ]);
  const competencyOptions = ACTIVE_COMPETENCIES.filter(
    (c: Competency) => mayGrant(c.id) || chosen.has(c.id),
  ).map((c: Competency) => ({
    value: c.id,
    label: c.display_name,
  }));

  // Get base profession competencies
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;
  const baseCompetencyIds = profession?.base_competencies || [];

  return (
    <Stack gap="md">
      <Heading>Competency configuration</Heading>
      <BodyText>
        Where this user differs from their base profession. The profession gives
        a new user its competencies once; after that, only what this user holds
        counts.
      </BodyText>

      {profession && (
        <Alert variant="light" color="primary">
          <BodyTextBold>
            Base profession: {profession.display_name}
          </BodyTextBold>
          <BodyText>
            What it gives a new user ({baseCompetencyIds.length}):
          </BodyText>
          <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
            {baseCompetencyIds.map((id) => {
              const comp = competenciesData.competencies.find(
                (c: Competency) => c.id === id,
              );
              return (
                <li key={id}>
                  <BodyTextInline>{comp?.display_name || id}</BodyTextInline>
                </li>
              );
            })}
          </ul>
        </Alert>
      )}

      <MultiSelectField
        label="Held beyond the profession"
        description="Competencies this user holds that their base profession does not give"
        placeholder="Select additional competencies"
        data={competencyOptions.filter(
          (c: { value: string; label: string }) =>
            !baseCompetencyIds.includes(c.value as CompetencyId),
        )}
        value={formData.additionalCompetencies}
        onChange={(value) =>
          setFormData({
            ...formData,
            additionalCompetencies: value as CompetencyId[],
          })
        }
        searchable
      />

      <MultiSelectField
        label="In the profession, not held"
        description="Competencies the profession gives that this user does not hold. One the profession gains later appears here until somebody grants it."
        placeholder="Select competencies not held"
        data={competencyOptions.filter((c: { value: string; label: string }) =>
          baseCompetencyIds.includes(c.value as CompetencyId),
        )}
        value={formData.removedCompetencies}
        onChange={(value) =>
          setFormData({
            ...formData,
            removedCompetencies: value as CompetencyId[],
          })
        }
        searchable
      />
    </Stack>
  );
}

/**
 * Step 4: Practice
 *
 * Where each competency may be used. A competency with no practice
 * behind it authorises nothing anywhere, so without this step a new
 * starter could do nothing until somebody opened each org_unit's staff
 * table and switched them on.
 */
function StepPractice({
  formData,
  setFormData,
  places,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  places: PracticePlace[];
}) {
  // A scoped manager, such as a teaching admin, switches only what is
  // on their whitelist; the rest are shown and held still.
  const { mayGrant } = useGrantScope();

  // No heading or introduction of its own: the stepper names the step,
  // and each card is headed with its org_unit and says "May practise
  // here" over its switches. A card explaining that above them was one
  // more thing to read before the thing itself.
  return (
    <PracticeByPlaceEditor
      places={places}
      competencies={heldCompetencies(formData)}
      value={practiceToSend(formData, places)}
      onChange={(value) =>
        setFormData({
          ...formData,
          // Merged, so switches at an org_unit not shown just now are
          // kept as they were.
          practising: { ...formData.practising, ...value },
        })
      }
      mayChange={mayGrant}
    />
  );
}

/**
 * The Enrolment step: which teaching modules they are enrolled on.
 *
 * The third of teaching's layers, after what they hold (Competencies)
 * and where (Practice). Ticking a module here is enough on its own: the
 * save gives the two learner competencies and a place where they are
 * missing, and the Review step says so before anything is saved.
 */
function StepEnrolment({
  formData,
  setFormData,
  organisations,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
  organisations: TeachingOrganisation[];
}) {
  return (
    <ModuleEnrolmentEditor
      organisations={organisations}
      value={enrolmentsToSend(formData, organisations)}
      onChange={(value) =>
        setFormData({
          ...formData,
          // Merged, so ticks at an organisation not shown just now are
          // kept as they were.
          enrolments: { ...formData.enrolments, ...value },
        })
      }
    />
  );
}

/**
 * The Platform role step. Shown to an operator only: anybody else has
 * the one option, "Standard", and nothing to decide.
 */
function StepPlatformRole({
  formData,
  setFormData,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  setFormData: (data: UserFormData) => void;
}) {
  const { state } = useAuth();
  const isSuperadmin = state.user?.platform_role === "superadmin";

  // A dropdown rather than a checkbox, though there are only two
  // options. A checkbox reads more naturally for a yes/no, but the
  // dropdown leaves room for further platform roles without redesigning
  // the step.
  //
  // Only an operator is offered the operator option, matching the
  // backend guard on PATCH /users/{id}: the manage_users competency says
  // what someone may administer, never that they may promote someone to
  // run the platform.
  const platformRoleOptions = [
    { value: "standard", label: "Standard - Not a Quill operator" },
    ...(isSuperadmin
      ? [
          {
            value: "superadmin",
            label: "Superadmin - Operates Quill itself",
          },
        ]
      : []),
  ];

  return (
    <Stack gap="md">
      <Heading>Platform role</Heading>
      <BodyText>
        Whether this person operates Quill itself. It grants no clinical access:
        what someone may do with patient records comes from their competencies,
        wherever they work.
      </BodyText>

      <SelectField
        label="Platform role"
        data={platformRoleOptions}
        value={formData.platformRole}
        onChange={(value) => {
          if (value) {
            setFormData({
              ...formData,
              platformRole: value as PlatformRole,
            });
          }
        }}
        required
      />
    </Stack>
  );
}

/**
 * Step 4: Review
 */
function Step4Review({
  formData,
  organisations,
  practice,
  enrolment,
  showPlatformRole,
}: Pick<StepContentProps, never> & {
  formData: UserFormData;
  organisations: OrgOption[];
  /**
   * The Practice step's answer, when the viewer was offered the step:
   * the org_units shown, and what was saved for each before this edit.
   */
  practice?: { places: PracticePlace[]; saved: PracticeByPlace };
  /**
   * The Enrolment step's answer, when the viewer was offered the step:
   * the organisations shown, and what was saved for each before this
   * edit.
   */
  enrolment?: {
    organisations: TeachingOrganisation[];
    saved: EnrolmentByOrganisation;
  };
  /** Whether the viewer was offered the Platform role step */
  showPlatformRole: boolean;
}) {
  const profession = formData.baseProfession
    ? getBaseProfessionDetails(formData.baseProfession)
    : null;

  const selectedOrgs = seenOrganisations(organisations).filter((o) =>
    formData.orgUnitIds.includes(String(o.id)),
  );
  const selectedSites = organisations.flatMap((org) =>
    org.sites
      .filter((s) => formData.orgUnitIds.includes(String(s.id)))
      .map((s) => siteLabel(org, s)),
  );

  return (
    <Stack gap="md">
      <Heading>Review</Heading>
      <BodyText>Review the user details before submitting.</BodyText>

      <BaseCard>
        <Stack gap="sm">
          <Group justify="space-between">
            <BodyTextBold>Name:</BodyTextBold>
            <BodyTextInline>{formData.name}</BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>Email:</BodyTextBold>
            <BodyTextInline>{formData.email}</BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>Username:</BodyTextBold>
            <BodyTextInline>{formData.username}</BodyTextInline>
          </Group>
          <Group justify="space-between">
            <BodyTextBold>Base profession:</BodyTextBold>
            <BodyTextInline>
              {profession?.display_name || "None"}
            </BodyTextInline>
          </Group>
          {/*
            The badge marks operators and renders nothing otherwise, so
            the plain text carries the standard case – a label pointing
            at an empty space reads as a fault rather than as an answer.
          */}
          {/* Only for somebody offered the step: a line about a choice
              they were never shown reads as theirs to have made. */}
          {showPlatformRole && (
            <Group justify="space-between">
              <BodyTextBold>Platform role:</BodyTextBold>
              {formData.platformRole === "superadmin" ? (
                <PlatformRoleBadge platformRole={formData.platformRole} />
              ) : (
                <BodyTextInline>Standard</BodyTextInline>
              )}
            </Group>
          )}
          {selectedOrgs.length > 0 && (
            <Group justify="space-between">
              <BodyTextBold>Organisations:</BodyTextBold>
              <BodyTextInline>
                {selectedOrgs.map((o) => o.name).join(", ")}
              </BodyTextInline>
            </Group>
          )}
          {selectedSites.length > 0 && (
            <Group justify="space-between">
              <BodyTextBold>Sites:</BodyTextBold>
              <BodyTextInline>{selectedSites.join(", ")}</BodyTextInline>
            </Group>
          )}
          {formData.additionalCompetencies.length > 0 && (
            <Box>
              <BodyTextBold>Held beyond the profession:</BodyTextBold>
              <Group gap="xs">
                {formData.additionalCompetencies.map((id) => (
                  <CompetencyBadge
                    key={id}
                    label={
                      competenciesData.competencies.find(
                        (c: Competency) => c.id === id,
                      )?.display_name || id
                    }
                  />
                ))}
              </Group>
            </Box>
          )}
          {formData.removedCompetencies.length > 0 && (
            <Box>
              <BodyTextBold>In the profession, not held:</BodyTextBold>
              <Group gap="xs">
                {formData.removedCompetencies.map((id) => (
                  <CompetencyBadge
                    key={id}
                    label={
                      competenciesData.competencies.find(
                        (c: Competency) => c.id === id,
                      )?.display_name || id
                    }
                    removed
                  />
                ))}
              </Group>
            </Box>
          )}
        </Stack>
      </BaseCard>

      {practice && practice.places.length > 0 && (
        <PracticeReview formData={formData} {...practice} />
      )}

      {enrolment && enrolment.organisations.length > 0 && (
        <EnrolmentReview
          formData={formData}
          {...enrolment}
          practice={practice}
        />
      )}
    </Stack>
  );
}

/**
 * What the save will enrol them on, organisation by organisation, what
 * it will take them off, and anything else it will give them.
 *
 * Ticking a module gives the two learner competencies and a place to
 * take modules where they are missing. That is said here, before the
 * save, so nothing is granted that this step did not show.
 */
function EnrolmentReview({
  formData,
  organisations,
  saved,
  practice,
}: {
  formData: UserFormData;
  organisations: TeachingOrganisation[];
  saved: EnrolmentByOrganisation;
  practice?: { places: PracticePlace[]; saved: PracticeByPlace };
}) {
  const chosen = enrolmentsToSend(formData, organisations);
  const held = new Set(heldCompetencies(formData));
  const missingCompetencies = LEARNER_COMPETENCIES.filter(
    (id) => !held.has(id),
  );
  // Where practice is being set on this form, a place they will not
  // have by the Practice step's own answer. Otherwise the form cannot
  // know, and says nothing rather than guess.
  const practising = practice
    ? practiceToSend(formData, practice.places)
    : undefined;
  const title = (organisation: TeachingOrganisation, moduleId: string) =>
    organisation.modules.find((module) => module.id === moduleId)?.title ??
    moduleId;

  return (
    <BaseCard>
      <Stack gap="sm">
        <BodyTextBold>Enrolment:</BodyTextBold>
        {organisations.map((organisation) => {
          const now = Object.keys(chosen[organisation.id] ?? {});
          const takenOff = Object.keys(saved[organisation.id] ?? {}).filter(
            (moduleId) => !now.includes(moduleId),
          );
          const placesGiven = practising
            ? organisation.orgUnitIds.filter(
                (unitId) =>
                  practising[unitId] !== undefined &&
                  !practising[unitId].includes("take_teaching_modules"),
              )
            : [];
          const gives = now.length > 0;
          return (
            <Box key={organisation.id}>
              <BodyTextBold>{organisation.name}</BodyTextBold>
              <BodyText>
                {now.length > 0
                  ? `Enrolled on: ${now
                      .map((moduleId) => {
                        const ends = chosen[organisation.id][moduleId];
                        const name = title(organisation, moduleId);
                        return ends
                          ? `${name} (until ${formatDay(ends)})`
                          : name;
                      })
                      .sort()
                      .join(", ")}`
                  : "Enrolled on nothing here"}
              </BodyText>
              {takenOff.length > 0 && (
                <BodyText>
                  {`Taken off: ${takenOff
                    .map((moduleId) => title(organisation, moduleId))
                    .sort()
                    .join(", ")}`}
                </BodyText>
              )}
              {gives && missingCompetencies.length > 0 && (
                <BodyText>
                  {`Enrolling also gives them: ${missingCompetencies
                    .map(competencyName)
                    .join(", ")}`}
                </BodyText>
              )}
              {gives && placesGiven.length > 0 && (
                <BodyText>
                  Enrolling also lets them take modules at each place they
                  belong to here.
                </BodyText>
              )}
            </Box>
          );
        })}
      </Stack>
    </BaseCard>
  );
}

/**
 * What the save will leave them able to practise, org_unit by org_unit.
 *
 * The Review step is this form's confirmation, so this is where a
 * withdrawal is named: it takes effect the moment the form is saved,
 * and the member practice page asks before doing the same thing.
 */
function PracticeReview({
  formData,
  places,
  saved,
}: {
  formData: UserFormData;
  places: PracticePlace[];
  saved: PracticeByPlace;
}) {
  const chosen = practiceToSend(formData, places);
  const held = new Set(heldCompetencies(formData));
  const shown = places.filter((place) => chosen[place.id] !== undefined);
  // What is authorised now, is still held, and is switched off.
  const withdrawn = (place: PracticePlace) =>
    (saved[place.id] ?? []).filter(
      (id) => held.has(id) && !chosen[place.id].includes(id),
    );
  const withdrawsAny = shown.some((place) => withdrawn(place).length > 0);

  if (shown.length === 0) return null;

  return (
    <BaseCard>
      <Stack gap="sm">
        <BodyTextBold>Practice:</BodyTextBold>
        {shown.map((place) => (
          <Box key={place.id}>
            <BodyTextBold>{place.name}</BodyTextBold>
            <BodyText>
              {chosen[place.id].length > 0
                ? `May practise: ${chosen[place.id]
                    .map(competencyName)
                    .sort()
                    .join(", ")}`
                : "May practise nothing here"}
            </BodyText>
            {withdrawn(place).length > 0 && (
              <BodyText>
                {`Withdrawn: ${withdrawn(place)
                  .map(competencyName)
                  .sort()
                  .join(", ")}`}
              </BodyText>
            )}
          </Box>
        ))}
        {withdrawsAny && (
          <ErrorMessage>
            Withdrawing stops them practising it there straight away. They stay
            qualified, and stay authorised anywhere else.
          </ErrorMessage>
        )}
      </Stack>
    </BaseCard>
  );
}

/**
 * New User Page Component
 *
 * Multi-step form for creating or editing users with competencies and permissions.
 * Supports two modes:
 * - Create mode: /admin/users/new - Creates a new user
 * - Edit mode: /admin/users/:id/edit - Edits an existing user
 *
 * @returns New/edit user page
 */
export default function UserInfoUpdatePage() {
  const navigate = useNavigate();
  const { id: userId } = useParams<{ id: string }>();
  const isEditMode = Boolean(userId);

  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { showMessage, clearAll } = usePageMessage();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The username as the server holds it, for the page header. Kept apart
  // from the form's, so the header does not change as the field is typed in.
  const [loadedUsername, setLoadedUsername] = useState("");
  const [organisations, setOrganisations] = useState<OrgOption[]>([]);
  // Every org_unit the viewer can name, for the Practice step's cards.
  const [placesById, setPlacesById] = useState<Map<number, OrgUnit>>(new Map());
  // Practice as the server holds it, to say what an edit withdraws.
  const [savedPractising, setSavedPractising] = useState<PracticeByPlace>({});

  // Setting practice takes its own competency, or a scoped manager's
  // whitelist: `manage_users` alone does not open the step, and the API
  // refuses a change sent without one.
  const maySetPractice = useHasAnyCompetency(
    "manage_practising_competencies",
    ...SCOPED_MANAGER_IDS,
  );

  // An operator runs Quill itself, and is the only one with a platform
  // role to choose; a teaching admin or an operator runs teaching, and
  // is offered the Enrolment step.
  const { state: authState } = useAuth();
  const isOperator =
    authState.status === "authenticated" &&
    authState.user.platform_role === "superadmin";
  const holdsManageTeaching = useHasCompetency("manage_teaching");
  const mayRunTeaching = isOperator || holdsManageTeaching;
  // What each chosen org_unit's organisation serves, as the API
  // answered, so an org_unit is asked about once.
  const servedByUnit = useRef(
    new Map<
      number,
      {
        organisationId: number | null;
        name: string | null;
        modules: { id: string; title: string }[];
      }
    >(),
  );
  const [teachingOrganisations, setTeachingOrganisations] = useState<
    TeachingOrganisation[]
  >([]);
  // Enrolments as the server holds them, to say what an edit takes off.
  const [savedEnrolments, setSavedEnrolments] =
    useState<EnrolmentByOrganisation>({});

  // A new user may arrive already half described: the add-staff page
  // sends somebody here when a lookup finds no account for an address,
  // with that address or username and the org_unit they were being
  // added to. Both
  // only fill the form in; the API still decides what may be saved.
  const [searchParams] = useSearchParams();
  const startingEmail = isEditMode ? "" : (searchParams.get("email") ?? "");
  const startingUsername = isEditMode
    ? ""
    : (searchParams.get("username") ?? "");
  const startingOrgUnit = isEditMode ? null : searchParams.get("org_unit");

  const [formData, setFormData] = useState<UserFormData>({
    name: "",
    email: startingEmail,
    username: startingUsername,
    password: "",
    baseProfession: "",
    additionalCompetencies: [],
    removedCompetencies: [],
    platformRole: "standard",
    orgUnitIds:
      startingOrgUnit && /^\d+$/.test(startingOrgUnit) ? [startingOrgUnit] : [],
    // Everything off for a new user: a competency authorises nothing
    // until somebody decides it does.
    practising: {},
    enrolments: {},
  });

  // Fetch user data in edit mode
  useEffect(() => {
    if (!isEditMode || !userId) return;

    async function fetchUser() {
      try {
        setLoading(true);
        // TODO: Backend needs to implement GET /api/users/:id endpoint
        const data = await api.get<{
          name?: string;
          email?: string;
          username?: string;
          base_profession?: string;
          additional_competencies?: string[];
          removed_competencies?: string[];
          platform_role?: PlatformRole;
          org_unit_ids?: number[];
          place_ids?: number[];
          practising?: { org_unit_id: number; competencies: string[] }[];
          teaching_enrolments?: {
            org_unit_id: number;
            modules: { module_id: string; ends_on: string | null }[];
          }[];
        }>(`/users/${userId}`);

        // Absent from a server built before the Practice step, which is
        // read as nothing saved.
        const practising: PracticeByPlace = {};
        for (const entry of data.practising ?? []) {
          practising[entry.org_unit_id] = entry.competencies;
        }
        setSavedPractising(practising);
        const enrolments: EnrolmentByOrganisation = {};
        for (const entry of data.teaching_enrolments ?? []) {
          enrolments[entry.org_unit_id] = Object.fromEntries(
            entry.modules.map((module) => [
              module.module_id,
              // The date alone: the field holds a day, and the end of
              // that day is what is sent back.
              module.ends_on ? module.ends_on.slice(0, 10) : null,
            ]),
          );
        }
        setSavedEnrolments(enrolments);
        setLoadedUsername(data.username || "");

        // Pre-fill form with user data
        setFormData({
          name: data.name || "",
          email: data.email || "",
          username: data.username || "",
          password: "", // Don't pre-fill password for security
          baseProfession: data.base_profession || "",
          additionalCompetencies: data.additional_competencies || [],
          removedCompetencies: data.removed_competencies || [],
          platformRole: data.platform_role || "standard",
          // org_unit_ids is the name the API answers in. place_ids is
          // the older name for the same list, read as a fallback so this
          // page works against a server from before the expand shipped.
          orgUnitIds: (data.org_unit_ids ?? data.place_ids ?? []).map(String),
          practising,
          enrolments,
        });
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setLoadError(
          error instanceof Error ? error.message : "Failed to load user data",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, [isEditMode, userId]);

  // Fetch every org_unit the person may be put in, in one request
  useEffect(() => {
    async function fetchPlaces() {
      try {
        const places = await orgUnits.list();

        const byId = new Map(places.map((place) => [place.id, place]));
        setPlacesById(byId);

        /**
         * The organisation an org_unit belongs to.
         *
         * Walked rather than read off the parent, because a ward can sit
         * inside a building inside a hospital, and it is still that
         * trust's ward. The walk is bounded by the number of org_units, so
         * a chain that somehow loops cannot hang the page.
         */
        function rootOf(place: OrgUnit): OrgUnit | undefined {
          let current: OrgUnit | undefined = place;
          for (let step = 0; step < places.length && current; step += 1) {
            if (current.is_root) return current;
            current =
              current.parent_id === null
                ? undefined
                : byId.get(current.parent_id);
          }
          return undefined;
        }

        const grouped = new Map<number, OrgOption>();
        for (const place of places) {
          if (place.is_root) {
            grouped.set(place.id, {
              id: place.id,
              name: place.name,
              sites: grouped.get(place.id)?.sites ?? [],
            });
          }
        }
        // An org_unit whose organisation is not in the answer is one the
        // person may administer without administering the tree above
        // it: somebody who runs one site. It is still theirs to put
        // people in, so it is offered under its own name. Leaving it
        // out left such an admin with nowhere to add anybody.
        const unseen: OrgOption = { id: -1, name: "", sites: [], unseen: true };
        for (const place of places) {
          if (place.is_root) continue;
          const root = rootOf(place);
          const group = root ? grouped.get(root.id) : unseen;
          group?.sites.push({ id: place.id, name: place.name });
        }

        setOrganisations([
          ...grouped.values(),
          ...(unseen.sites.length > 0 ? [unseen] : []),
        ]);
      } catch (error) {
        console.error("Failed to fetch places:", error);
      }
    }

    fetchPlaces();
  }, []);

  // Block navigation when form is dirty and not yet submitted
  // The Enrolment step is decided by the person being edited: which of
  // the org_units they are being put at sit under an organisation that
  // serves teaching modules. Each chosen org_unit is asked about once.
  const chosenUnits = formData.orgUnitIds.join(",");
  useEffect(() => {
    if (!mayRunTeaching) return;
    let active = true;
    async function load() {
      const unitIds = chosenUnits ? chosenUnits.split(",").map(Number) : [];
      await Promise.all(
        unitIds
          .filter((unitId) => !servedByUnit.current.has(unitId))
          .map(async (unitId) => {
            try {
              const data = await api.get<{
                organisation_id: number | null;
                organisation_name: string | null;
                modules: { question_bank_id: string; title: string }[];
              }>(`/teaching/admin/org-units/${unitId}/modules`);
              servedByUnit.current.set(unitId, {
                organisationId: data.organisation_id,
                name: data.organisation_name,
                modules: data.modules.map((module) => ({
                  id: module.question_bank_id,
                  title: module.title,
                })),
              });
            } catch {
              // An org_unit the viewer may not ask about, or teaching
              // not on there: no step for it, and nothing is sent.
              servedByUnit.current.set(unitId, {
                organisationId: null,
                name: null,
                modules: [],
              });
            }
          }),
      );
      if (!active) return;
      const byOrganisation = new Map<number, TeachingOrganisation>();
      for (const unitId of unitIds) {
        const served = servedByUnit.current.get(unitId);
        if (!served || served.organisationId === null) continue;
        if (served.modules.length === 0) continue;
        const organisation = byOrganisation.get(served.organisationId) ?? {
          id: served.organisationId,
          name: served.name ?? "",
          modules: served.modules,
          orgUnitIds: [],
        };
        organisation.orgUnitIds.push(unitId);
        byOrganisation.set(served.organisationId, organisation);
      }
      setTeachingOrganisations(
        [...byOrganisation.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
    }
    void load();
    return () => {
      active = false;
    };
  }, [chosenUnits, mayRunTeaching]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !success && currentLocation.pathname !== nextLocation.pathname,
  );

  // Wrapper to set form data and mark as dirty
  function updateFormData(newData: UserFormData) {
    setFormData(newData);
    setDirty(true);
  }

  function handleCancel() {
    setDirty(false); // Allow navigation
    navigate("/admin/users");
  }

  function validateStep1(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }
    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    }

    // Password validation
    if (isEditMode) {
      // In edit mode, password is optional (only validate if provided)
      if (formData.password && formData.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      }
    } else {
      // In create mode, password is required
      if (!formData.password.trim()) {
        newErrors.password = "Password is required";
      } else if (formData.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      }
    }

    if (!formData.baseProfession) {
      newErrors.baseProfession = "Base profession is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const shownPracticePlaces = practicePlaces(formData, placesById);
  const showEnrolment = mayRunTeaching && teachingOrganisations.length > 0;

  async function save() {
    if (submitting) return;

    setSubmitting(true);
    try {
      const payload: {
        name: string;
        email: string;
        username: string;
        base_profession: BaseProfessionId | "";
        additional_competencies: CompetencyId[];
        removed_competencies: CompetencyId[];
        platform_role: PlatformRole;
        password?: string;
        org_unit_ids: number[];
        practising?: { org_unit_id: number; competencies: string[] }[];
        teaching_enrolments?: {
          org_unit_id: number;
          modules: { module_id: string; ends_on: string | null }[];
        }[];
      } = {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        base_profession: formData.baseProfession,
        additional_competencies: formData.additionalCompetencies,
        removed_competencies: formData.removedCompetencies,
        platform_role: formData.platformRole,
        org_unit_ids: formData.orgUnitIds.map(Number),
      };

      // Sent only by a viewer who was offered the step. Left out, the
      // API changes nobody's practice.
      if (maySetPractice) {
        payload.practising = Object.entries(
          practiceToSend(formData, shownPracticePlaces),
        ).map(([orgUnitId, competencies]) => ({
          org_unit_id: Number(orgUnitId),
          competencies,
        }));
      }

      // Only include password if provided (required for create, optional for edit)
      // Only when the step was offered, so somebody who never saw it
      // does not end enrolments by saving. An organisation with every
      // module unticked is still sent: that is an answer.
      if (showEnrolment) {
        payload.teaching_enrolments = Object.entries(
          enrolmentsToSend(formData, teachingOrganisations),
        ).map(([organisationId, modules]) => ({
          org_unit_id: Number(organisationId),
          modules: Object.entries(modules).map(([moduleId, endsOn]) => ({
            module_id: moduleId,
            // The whole of the day chosen, so "until the 5th" includes
            // the 5th.
            ends_on: endsOn ? `${endsOn}T23:59:59Z` : null,
          })),
        }));
      }
      if (formData.password) {
        payload.password = formData.password;
      }

      if (isEditMode && userId) {
        // Edit mode: PATCH existing user
        await api.patch(`/users/${userId}`, payload);
      } else {
        // Create mode: POST new user
        await api.post("/users", payload);
      }

      // Leaving is done by the effect below, once this has rendered:
      // the blocker reads `success`, and would stop a navigation made
      // here, before it has seen the change.
      setSuccess(true);
    } catch (error) {
      console.error(
        `Failed to ${isEditMode ? "update" : "create"} user:`,
        error,
      );
      // Stay on Review with everything as it was entered, so the save
      // can be tried again or a step put right.
      showMessage({
        variant: "error",
        title: isEditMode ? "User not updated" : "User not created",
        description:
          (error instanceof Error && error.message) ||
          "Something went wrong. Nothing was saved. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Once saved, back to the list of users, which says what happened.
  // There is no result step: Review is the last one, and its button
  // saves.
  const savedUsername = formData.username;
  useEffect(() => {
    if (!success) return;
    navigate("/admin/users", {
      state: {
        flash: {
          variant: "success",
          title: isEditMode ? "User updated" : "User created",
          description: isEditMode
            ? `${savedUsername}'s details have been updated.`
            : `${savedUsername} has been created and can now log in.`,
        },
      },
    });
  }, [success, isEditMode, savedUsername, navigate]);

  const steps: StepConfig[] = [
    {
      label: "Basic details",
      description: "Name, email, and base profession",
      content: (props) => (
        <Step1BasicDetails
          {...props}
          formData={formData}
          setFormData={updateFormData}
          errors={errors}
          isEditMode={isEditMode}
        />
      ),
      validate: validateStep1,
    },
    {
      label: "Organisation/site",
      description: "Assign to organisation and site",
      content: (props) => (
        <Step2Organisation
          {...props}
          formData={formData}
          setFormData={updateFormData}
          organisations={organisations}
        />
      ),
    },
    {
      label: "Competencies",
      description: "Configure competency access",
      content: (props) => (
        <Step2Competencies
          {...props}
          formData={formData}
          setFormData={updateFormData}
        />
      ),
    },
    // After Competencies, because it is built from the two steps before
    // it: where they are being put, and what they will hold.
    ...(maySetPractice
      ? [
          {
            label: "Practice",
            description: "Where they may practise",
            content: (props: StepContentProps) => (
              <StepPractice
                {...props}
                formData={formData}
                setFormData={updateFormData}
                places={shownPracticePlaces}
              />
            ),
            // The editor draws a card for each org_unit, and a card
            // inside the step's own card would be a box in a box.
            hideCard: true,
          } satisfies StepConfig,
        ]
      : []),
    // After Practice: the third of teaching's layers, after what they
    // hold and where. Decided by the person being edited, not by who is
    // editing them.
    ...(showEnrolment
      ? [
          {
            label: "Enrolment",
            description: "Teaching modules",
            content: (props: StepContentProps) => (
              <StepEnrolment
                {...props}
                formData={formData}
                setFormData={updateFormData}
                organisations={teachingOrganisations}
              />
            ),
            // One card for each organisation, as Practice has one for
            // each org_unit.
            hideCard: true,
          } satisfies StepConfig,
        ]
      : []),
    // An operator only. Anybody else has one option here and nothing to
    // decide, and the API refuses a platform role they set.
    ...(isOperator
      ? [
          {
            label: "Platform role",
            description: "Whether they operate Quill",
            content: (props: StepContentProps) => (
              <StepPlatformRole
                {...props}
                formData={formData}
                setFormData={updateFormData}
              />
            ),
          } satisfies StepConfig,
        ]
      : []),
    {
      label: "Review",
      description: "Review and submit",
      content: (props) => (
        <Step4Review
          {...props}
          formData={formData}
          organisations={organisations}
          practice={
            maySetPractice
              ? { places: shownPracticePlaces, saved: savedPractising }
              : undefined
          }
          enrolment={
            showEnrolment
              ? { organisations: teachingOrganisations, saved: savedEnrolments }
              : undefined
          }
          showPlatformRole={isOperator}
        />
      ),
      nextButtonLabel: isEditMode ? "Update user" : "Create user",
    },
  ];

  function handleSubmit() {
    // A failure message from an earlier try would otherwise sit above
    // the new attempt.
    clearAll();
    void save();
  }

  return (
    <>
      <Stack gap="lg">
        <PageHeader
          title={
            !isEditMode
              ? "Create new user"
              : loadedUsername
                ? `Edit user: ${loadedUsername}`
                : "Edit user"
          }
        />

        {loading ? (
          <Center>
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <BodyText>Loading user data...</BodyText>
            </Stack>
          </Center>
        ) : loadError ? (
          <ErrorState
            title="Error loading user"
            message={loadError}
            action={{
              label: "Return to admin",
              icon: "arrowLeft",
              onClick: () => navigate("/admin/users"),
            }}
          />
        ) : (
          <MultiStepForm
            steps={steps}
            onCancel={handleCancel}
            activeStep={activeStep}
            onStepChange={setActiveStep}
            onSubmit={handleSubmit}
            allStepsAccessible={isEditMode}
          />
        )}
      </Stack>

      <DirtyFormNavigation
        blocker={blocker}
        onProceed={() => setDirty(false)}
      />
    </>
  );
}
