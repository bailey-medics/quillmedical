/**
 * The real frameworks as a catalogue, for tests and Storybook.
 *
 * Built from the generated bundle, which still holds the frameworks, in
 * the shape `GET /api/passport/catalogue` serves them, so a component
 * under test reads exactly what the backend would give it. The bundle
 * stops holding frameworks in the next unit of Phase 7 of
 * docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md, and
 * this then reads a fixture of its own.
 */

import { FrameworkCatalogue } from "@lib/passport/catalogue";
import type { FrameworkDefinition } from "@lib/passport/types";
import { ALL_COMPETENCIES, ALL_FRAMEWORKS } from "@/types/cbac";

/** Every framework in the bundle, as the backend serves it. */
export const TEST_FRAMEWORK_DEFINITIONS: FrameworkDefinition[] =
  ALL_FRAMEWORKS.map((framework) => ({
    id: framework.id,
    name: framework.name,
    publisher: framework.publisher,
    version: framework.version,
    specialties: framework.specialties,
    competencies: ALL_COMPETENCIES.filter(
      (competency) => competency.framework_id === framework.id,
    ).map((competency) => ({
      id: competency.id,
      display_name: competency.display_name,
      levels: (competency.levels ?? []).map((level, position) => ({
        ...level,
        position,
      })),
      scopes: competency.scopes ?? [],
      expires_after_months: competency.expires_after_months ?? null,
      retired_on: competency.retired_on ?? null,
      retired_in_version: null,
    })),
  }));

/** The real frameworks, for a component that takes a catalogue. */
export const TEST_FRAMEWORK_CATALOGUE = new FrameworkCatalogue(
  TEST_FRAMEWORK_DEFINITIONS,
);
