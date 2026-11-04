/**
 * The frameworks as the backend serves them, from the framework tables.
 *
 * `GET /api/passport/catalogue` serves every framework Quill holds, at
 * its newest version. This turns that answer into the shapes the pages
 * already read, `FrameworkOption` and `Competency`, so a page does not
 * change shape when its source moves from the generated bundle to the
 * backend. See Phase 7 of
 * docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
 *
 * `useFrameworkCatalogue` loads it once for the whole app and shares it:
 * a framework changes only when a framework repository merges, so
 * nothing on a page needs it fresher than the page itself.
 */

import { useEffect, useState } from "react";
import type { Competency } from "@/types/cbac";
import { fetchFrameworkCatalogue } from "./api";
import type { FrameworkOption } from "./frameworks";
import type {
  FrameworkCompetencyDefinition,
  FrameworkDefinition,
} from "./types";

/** The frameworks Quill holds, with the lookups a page needs. */
export class FrameworkCatalogue {
  /** Every framework, alphabetically by name. */
  readonly frameworks: FrameworkOption[];

  private readonly byFramework: Map<string, Competency[]>;

  private readonly byCompetency: Map<string, Competency>;

  constructor(definitions: FrameworkDefinition[]) {
    this.frameworks = definitions
      .map(({ id, name, publisher, specialties }) => ({
        id,
        name,
        publisher,
        specialties,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    this.byFramework = new Map(
      definitions.map((framework) => [
        framework.id,
        framework.competencies.map((entry) => asCompetency(framework, entry)),
      ]),
    );

    this.byCompetency = new Map(
      [...this.byFramework.values()]
        .flat()
        .map((competency) => [competency.id, competency]),
    );
  }

  /** The framework with this id, or undefined where Quill holds none. */
  getFramework(id: string): FrameworkOption | undefined {
    return this.frameworks.find((framework) => framework.id === id);
  }

  /**
   * A framework's items, in the order its file lists them: the active
   * competencies somebody can be assessed on. Empty for an unknown one.
   */
  frameworkItems(frameworkId: string): Competency[] {
    return (this.byFramework.get(frameworkId) ?? []).filter(
      (competency) => competency.retired_on === undefined,
    );
  }

  /** A framework competency by id, retired ones included, or undefined. */
  competency(competencyId: string): Competency | undefined {
    return this.byCompetency.get(competencyId);
  }

  /**
   * The framework a competency belongs to, or undefined for one Quill no
   * longer knows.
   */
  frameworkOf(competencyId: string): FrameworkOption | undefined {
    const frameworkId = this.byCompetency.get(competencyId)?.framework_id;

    return frameworkId === undefined
      ? undefined
      : this.getFramework(frameworkId);
  }
}

/**
 * One served competency, in the shape the generated bundle gave it. A
 * missing value is left out rather than set to null, as the bundle did.
 */
function asCompetency(
  framework: FrameworkDefinition,
  entry: FrameworkCompetencyDefinition,
): Competency {
  const competency: Competency = {
    id: entry.id,
    display_name: entry.display_name,
    // Every framework competency is assessable: that is what a
    // framework is.
    assessable: true,
    framework_id: framework.id,
  };

  if (entry.levels.length > 0) {
    competency.levels = [...entry.levels]
      .sort((a, b) => a.position - b.position)
      .map(({ id, name }) => ({ id, name }));
  }
  if (entry.scopes.length > 0) {
    competency.scopes = entry.scopes.map(({ id, name }) => ({ id, name }));
  }
  if (entry.expires_after_months !== null) {
    competency.expires_after_months = entry.expires_after_months;
  }
  if (entry.retired_on !== null) {
    competency.retired_on = entry.retired_on;
  }

  return competency;
}

/** The one load, shared by every page that asks. */
let loading: Promise<FrameworkCatalogue> | null = null;

/** Forget the shared load, so the next page loads again. For tests. */
export function forgetFrameworkCatalogue(): void {
  loading = null;
}

/** Load the catalogue, or reuse the load already started. */
export function loadFrameworkCatalogue(): Promise<FrameworkCatalogue> {
  loading ??= fetchFrameworkCatalogue()
    .then((definitions) => new FrameworkCatalogue(definitions))
    .catch((error: unknown) => {
      // A failed load is not kept, so the next page tries again.
      loading = null;
      throw error;
    });

  return loading;
}

/** What `useFrameworkCatalogue` gives back while it loads, and after. */
export interface FrameworkCatalogueState {
  /** The frameworks, or null until they have loaded. */
  catalogue: FrameworkCatalogue | null;
  /** True if the load failed. */
  failed: boolean;
}

/** The frameworks Quill holds, loaded once and shared. */
export function useFrameworkCatalogue(): FrameworkCatalogueState {
  const [state, setState] = useState<FrameworkCatalogueState>({
    catalogue: null,
    failed: false,
  });

  useEffect(() => {
    let cancelled = false;

    loadFrameworkCatalogue()
      .then((catalogue) => {
        if (!cancelled) setState({ catalogue, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ catalogue: null, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
