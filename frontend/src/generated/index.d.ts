/**
 * Type declarations for generated JSON files
 *
 * These files are auto-generated from YAML sources.
 * Run `npm run generate:types` to regenerate.
 */

declare module "@/generated/competencies.json" {
  interface Competency {
    id: string;
    display_name: string;
    description: string;
    category: string;
    risk_level: string;
    requires_registration: boolean;
    registration_type: string[];
    requires_supervision: boolean;
    audit_retention_days: number;
    clinical_safety_notes: string;
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
