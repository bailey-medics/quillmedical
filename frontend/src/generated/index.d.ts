/**
 * Type declarations for generated JSON files
 *
 * These files are auto-generated from YAML sources.
 * Run `npm run generate:types` to regenerate.
 */

declare module "@/generated/competencies.json" {
  // Merged from every file in shared/competency-definitions/ by
  // scripts/generate-json-from-yaml.ts. The split by kind is invisible
  // here: one flat catalogue, keyed by id.
  interface CompetencyLevel {
    id: string;
    name: string;
  }

  interface Competency {
    id: string;
    display_name: string;
    retired_on?: string;
    // Present only where a competency is signed off against a scale.
    // Order is the scale. Used by the clinician passport; CBAC ignores
    // both of these, since holding a competency is a yes or no.
    levels?: CompetencyLevel[];
    expires_after_months?: number;
  }

  const data: {
    competencies: Competency[];
  };

  export default data;
}

declare module "@/generated/base-professions.json" {
  interface BaseProfession {
    id: string;
    display_name: string;
    description: string;
    requires_clinical_services: boolean;
    base_competencies: string[];
    notes: string;
  }

  const data: {
    base_professions: BaseProfession[];
  };

  export default data;
}

declare module "@/generated/jurisdiction-config.json" {
  const data: {
    jurisdiction: {
      country: string;
      regulatory_bodies: Array<{
        id: string;
        name: string;
        role: string;
      }>;
    };
  };

  export default data;
}
