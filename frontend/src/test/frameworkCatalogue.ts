/**
 * The framework fixtures as a catalogue, for tests and Storybook.
 *
 * Built from `shared/framework-fixtures/`, which `yarn generate:types`
 * writes to `src/generated/framework-fixtures.json`, in the shape
 * `GET /api/passport/catalogue` serves, so a component under test reads
 * what the backend would give it. The backend's tests and the end-to-end
 * stack sync from the same fixtures. The app itself never reads them: it
 * loads the frameworks from the backend.
 */

import fixturesData from "@/generated/framework-fixtures.json";
import { FrameworkCatalogue } from "@lib/passport/catalogue";
import type { FrameworkDefinition } from "@lib/passport/types";

/** Every framework fixture, as the backend serves it. */
export const TEST_FRAMEWORK_DEFINITIONS: FrameworkDefinition[] =
  fixturesData.fixtures.map(({ framework, competencies }) => ({
    id: framework.id,
    name: framework.name,
    publisher: framework.publisher,
    version: framework.version,
    specialties: framework.specialties ?? [],
    competencies: competencies.map((competency) => ({
      id: competency.id,
      display_name: competency.display_name,
      levels: (competency.levels ?? []).map((level, position) => ({
        ...level,
        position,
        retired_on: level.retired_on ?? null,
        retired_in_version: level.retired_in_version ?? null,
      })),
      scopes: competency.scopes ?? [],
      expires_after_months: competency.expires_after_months ?? null,
      retired_on: competency.retired_on ?? null,
      retired_in_version: competency.retired_in_version ?? null,
    })),
  }));

/** The framework fixtures, for a component that takes a catalogue. */
export const TEST_FRAMEWORK_CATALOGUE = new FrameworkCatalogue(
  TEST_FRAMEWORK_DEFINITIONS,
);
