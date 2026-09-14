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
  // Generated from shared/jurisdiction-config.yaml. This declaration was
  // wrong until the passport read it: it described a single
  // `jurisdiction` with `regulatory_bodies`, while the generated file
  // has always held `jurisdictions` keyed by id. Nothing caught it
  // because nothing imported the file — the first reader had to cast
  // around it, which is exactly how a stale declaration survives.
  interface ProfessionalRegistration {
    id: string;
    display_name: string;
    description?: string;
    verification_url?: string;
    required_for_professions?: string[];
  }

  interface Jurisdiction {
    display_name: string;
    regulatory_authority?: string;
    data_protection?: string;
    prescribing_regulations?: string;
    professional_registrations?: ProfessionalRegistration[];
  }

  const data: {
    jurisdictions: Record<string, Jurisdiction>;
    default_jurisdiction: string;
  };

  export default data;
}
