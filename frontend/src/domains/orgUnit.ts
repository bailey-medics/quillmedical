/**
 * Org unit domain model
 *
 * An org_unit is one org_unit in the governance tree. A trust is one, and so
 * is a ward; what tells them apart is the `type`, never the position. The
 * tree answers governance questions — who is accountable for this org_unit,
 * whose rules apply here, who may administer it.
 *
 * The backend serves every org_unit from one address, `/api/org-units`. The
 * older `/api/organisations` and `/api/sites` addresses answer in
 * different numbers and are retired once nothing reads them.
 */

import { api } from "@/lib/api";
import orgUnitTypesData from "@/generated/org-unit-types.json";

/**
 * The kinds of org_unit that sit inside another one.
 *
 * Read from `shared/org-unit-types.yaml`, the same file the backend
 * validates against, rather than written out again on each screen. Three
 * screens carried their own copy, which is how a list of kinds comes to
 * disagree with what the server will accept.
 *
 * `requires_parent` is what separates them from an organisation: a ward
 * sits inside something, a trust does not.
 */
export const placeTypeOptions = orgUnitTypesData.org_unit_types
  .filter((type) => type.requires_parent)
  .map((type) => ({ value: type.id, label: type.display_name }));

/**
 * The kinds of organisation — the org_units that stand at the top of a tree.
 *
 * These used to be a list of their own on two screens, and a column on a
 * table that is going. A kind that the server does not know is a kind the
 * screen must not offer, which is what reading them from one file buys.
 */
export const organisationTypeOptions = orgUnitTypesData.org_unit_types
  .filter((type) => !type.requires_parent)
  .map((type) => ({ value: type.id, label: type.display_name }));

/** One org_unit in the tree, as a list shows it. */
export type OrgUnit = {
  /** org_unit ID. */
  id: number;
  /** What it is called. */
  name: string;
  /** Its type, from `shared/org-unit-types.yaml`. */
  type: string;
  /** What a person is shown for the type. */
  type_display_name: string;
  /**
   * Whether it is the top of a tree — an organisation.
   *
   * Declared by the type, never worked out from having no parent above
   * it. That is what lets something sit above today's organisations one
   * day without every screen changing its mind about what they are.
   */
  is_root: boolean;
  /** The org_unit it sits inside, or null at the top of a tree. */
  parent_id: number | null;
  /** Free text, possibly empty. */
  location: string;
  /** Whether it is in use. */
  is_active: boolean;
  /** ISO timestamp when created. */
  created_at: string;
  /** ISO timestamp when last changed. */
  updated_at: string;
};

/** Somebody at an org_unit, and in what capacity. */
export type OrgUnitMember = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  /** staff, trainee, external or patient. */
  capacity: string;
};

/**
 * Somebody authorised to practise one competency at an org_unit.
 *
 * One row per person and competency, so somebody authorised for three
 * things here appears three times. Flattened rather than grouped because
 * withdrawal is per competency: the screen needs something to withdraw,
 * not a person to edit.
 */
export type PractisingCompetency = {
  user_id: number;
  username: string;
  full_name: string;
  /** A competency id from `shared/competency-definitions/`. */
  competency: string;
  /** ISO timestamp of when practice here was authorised. */
  authorised_at: string;
  /** Who authorised it, or null once that person is deleted. */
  authorised_by: number | null;
};

/** An org_unit directly inside another. */
export type OrgUnitChild = {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  /** Who holds its clinical lead post, or null when it is vacant. */
  clinical_lead_id: number | null;
  /**
   * That person's name, so a list of org_units reads without a request per
   * row. Empty when the post is vacant, which is a real state rather
   * than a missing value.
   */
  clinical_lead_name: string;
};

/** One org_unit and everything hanging off it. */
export type OrgUnitDetail = OrgUnit & {
  /**
   * What the org_unit above is called, so a page can say where this one
   * sits without a second request. Empty at the top of a tree.
   */
  parent_name: string;
  /**
   * Whether the org_unit above is an organisation, which decides which of
   * the two pages a link upwards should go to.
   */
  parent_is_root: boolean;
  /** Who is here. */
  members: OrgUnitMember[];
  /** The org_units directly inside this one. */
  children: OrgUnitChild[];
  /** Features switched on here. Only the top of a tree carries any. */
  features: string[];
  /** Patients this org_unit is responsible for. Top of a tree only. */
  patient_ids: string[];
  /**
   * Who holds the clinical lead post here, or null when it is vacant.
   *
   * Read this rather than looking through `members`: the post is the
   * thing being asked about, and a vacancy is a real state that a missing
   * person cannot express.
   */
  clinical_lead_id: number | null;
};

/** A feature switched on at an org_unit. */
export type OrgUnitFeature = {
  feature_key: string;
  enabled_at: string | null;
  enabled_by: number | null;
};

/** A relationship between two org_units that is not ownership. */
export type OrgUnitLink = {
  id: number;
  source_id: number;
  source_name: string;
  target_id: number;
  target_name: string;
  relation: string;
  relation_display_name: string;
  created_at: string;
};

type ListResponse = { org_units: OrgUnit[] };
type MembersResponse = { members: OrgUnitMember[] };
type PractisingCompetenciesResponse = {
  practising_competencies: PractisingCompetency[];
};
type FeaturesResponse = { features: OrgUnitFeature[] };
type LinksResponse = { links: OrgUnitLink[] };
type StatusResponse = { status: string };

/** What to create an org_unit as. */
export type NewOrgUnit = {
  name: string;
  type: string;
  /** Null creates the top of a tree, which only an operator may do. */
  parent_id?: number | null;
  location?: string | null;
};

/** What to change about an org_unit. Only the fields given are changed. */
export type OrgUnitChanges = {
  name?: string;
  type?: string;
  parent_id?: number;
  location?: string;
};

/**
 * Everything the screens do with org_units.
 *
 * Gathered here rather than spelled out at each screen so that the
 * addresses appear once. The last rename showed why: the same path was
 * written out in a dozen files, and moving it meant finding all of them.
 */
export const orgUnits = {
  /**
   * List org_units.
   *
   * @param opts.roots - true for the organisations, false for the org_units
   *   inside them, omitted for both.
   * @param opts.parentId - only the org_units directly inside this one.
   */
  list: async (opts?: {
    roots?: boolean;
    parentId?: number;
  }): Promise<OrgUnit[]> => {
    const query = new URLSearchParams();
    if (opts?.roots !== undefined) query.set("roots", String(opts.roots));
    if (opts?.parentId !== undefined)
      query.set("parent_id", String(opts.parentId));
    const suffix = query.toString() ? `?${query}` : "";
    const data = await api.get<ListResponse>(`/org-units${suffix}`);
    return data.org_units ?? [];
  },

  /** One org_unit, with who is here and what is inside it. */
  get: (id: number) => api.get<OrgUnitDetail>(`/org-units/${id}`),

  /** Create an org_unit. */
  create: (unit: NewOrgUnit) => api.post<OrgUnit>("/org-units", unit),

  /** Change an org_unit. */
  update: (id: number, changes: OrgUnitChanges) =>
    api.put<OrgUnit>(`/org-units/${id}`, changes),

  /** Put an org_unit in or out of use. */
  setActive: (id: number, isActive: boolean) =>
    api.patch<OrgUnit>(`/org-units/${id}/active`, { is_active: isActive }),

  /** Delete an org_unit. */
  remove: (id: number) => api.del<StatusResponse>(`/org-units/${id}`),

  /** Everybody at an org_unit. */
  members: async (id: number): Promise<OrgUnitMember[]> => {
    const data = await api.get<MembersResponse>(`/org-units/${id}/members`);
    return data.members ?? [];
  },

  /** Record that somebody is at an org_unit. Repeating it changes capacity. */
  addMember: (
    id: number,
    member: {
      user_id: number;
      capacity?: string;
      base_profession?: string | null;
      additional_competencies?: string[] | null;
    },
  ) => api.post<StatusResponse>(`/org-units/${id}/members`, member),

  /** Take somebody off an org_unit. */
  removeMember: (id: number, userId: number) =>
    api.del<StatusResponse>(`/org-units/${id}/members/${userId}`),

  /**
   * Who may practise what at an org_unit.
   *
   * The rows as stored, not narrowed to anybody's competencies. A row
   * beyond somebody's competencies authorises nothing, but somebody
   * wrote it, and whoever reviews authorisations here needs to see it.
   */
  practisingCompetencies: async (
    id: number,
  ): Promise<PractisingCompetency[]> => {
    const data = await api.get<PractisingCompetenciesResponse>(
      `/org-units/${id}/practising-competencies`,
    );
    return data.practising_competencies ?? [];
  },

  /**
   * Authorise somebody to practise a competency at an org_unit.
   *
   * Not a grant of the competency itself: that is held by the person,
   * earned through training and sign-off. This records only that they
   * may exercise it here. Asking twice changes nothing.
   */
  authorisePractising: (
    id: number,
    body: { user_id: number; competency: string },
  ) =>
    api.post<StatusResponse>(`/org-units/${id}/practising-competencies`, body),

  /**
   * Stop somebody practising a competency at an org_unit.
   *
   * Their competency itself is untouched: somebody stopped at one place
   * stays qualified, and stays authorised everywhere else they hold a
   * row.
   */
  withdrawPractising: (id: number, userId: number, competency: string) =>
    api.del<StatusResponse>(
      `/org-units/${id}/practising-competencies/${userId}/${competency}`,
    ),

  /**
   * Name the clinical lead of an org_unit, or leave the post vacant.
   *
   * One call rather than an add and a remove, because a vacancy is a
   * real state: "this ward has no clinical lead" is something somebody
   * has to act on, not the absence of a fact.
   */
  setClinicalLead: (id: number, userId: number | null) =>
    api.put<StatusResponse>(`/org-units/${id}/clinical-lead`, {
      user_id: userId,
    }),

  /** Which features are on at an org_unit. */
  features: async (id: number): Promise<OrgUnitFeature[]> => {
    const data = await api.get<FeaturesResponse>(`/org-units/${id}/features`);
    return data.features ?? [];
  },

  /** Switch a feature on or off. */
  setFeature: (id: number, featureKey: string, enabled: boolean) =>
    api.put<StatusResponse>(`/org-units/${id}/features/${featureKey}`, {
      enabled,
    }),

  /** Record that an org_unit is responsible for a patient. */
  addPatient: (id: number, patientId: string) =>
    api.post<StatusResponse>(`/org-units/${id}/patients`, {
      patient_id: patientId,
    }),

  /** Stop an org_unit being responsible for a patient. */
  removePatient: (id: number, patientId: string) =>
    api.del<StatusResponse>(`/org-units/${id}/patients/${patientId}`),

  /** Every relationship an org_unit is either end of. */
  links: async (id: number): Promise<OrgUnitLink[]> => {
    const data = await api.get<LinksResponse>(`/org-units/${id}/links`);
    return data.links ?? [];
  },

  /** Record a relationship from this org_unit to another. */
  addLink: async (
    id: number,
    link: { target_id: number; relation: string },
  ): Promise<OrgUnitLink[]> => {
    const data = await api.post<LinksResponse>(`/org-units/${id}/links`, link);
    return data.links ?? [];
  },

  /** Remove a relationship. Either end may. */
  removeLink: async (id: number, linkId: number): Promise<OrgUnitLink[]> => {
    const data = await api.del<LinksResponse>(
      `/org-units/${id}/links/${linkId}`,
    );
    return data.links ?? [];
  },
};
