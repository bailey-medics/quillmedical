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
    // Whether the clinician passport may record something against it.
    // Opt-in: absent means a software permission rather than a skill.
    assessable?: boolean;
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

declare module "@/generated/org-unit-types.json" {
  // Generated from shared/org-unit-types.yaml, the one list of what a
  // place can be. The flags say what a type of place can hold, so a
  // rule asks "can this hold a clinical lead?" rather than carrying its
  // own list of names.
  interface OrgUnitType {
    id: string;
    display_name: string;
    description: string;
    requires_parent: boolean;
    can_hold_features: boolean;
    can_hold_positions: boolean;
    can_hold_competencies: boolean;
    can_have_members: boolean;
  }

  const data: {
    org_unit_types: OrgUnitType[];
  };

  export default data;
}

declare module "@/generated/brand.json" {
  // Generated from shared/brand.yaml. theme.ts reads the brand colours
  // and palette. The email themes are the backend's to resolve and render
  // (backend/app/email/); a colour in one is a hex value or a palette
  // reference such as "primary.8".
  interface EmailFont {
    family: string;
    axes: string;
  }

  interface EmailImage {
    src: string;
    width: number;
    height: number;
    alt: string;
  }

  interface EmailDarkTheme {
    background: string;
    card: string;
    header: string;
    border: string;
    text: string;
    muted: string;
    link: string;
    panel: string;
    footer: string;
  }

  interface EmailThemeSource {
    sender_name: string;
    fonts: EmailFont[];
    font_family: string;
    heading_font_family: string;
    heading_weight: number;
    h1_size: string;
    h2_size: string;
    heading_accent: string;
    background: string;
    card: string;
    card_border: string;
    border: string;
    header: string;
    header_rule_width: string;
    header_rule: string;
    header_logo: EmailImage;
    header_name?: string;
    heading: string;
    text: string;
    muted: string;
    link: string;
    button_background: string;
    button_text: string;
    button_radius: string;
    panel: string;
    panel_border: string;
    panel_text: string;
    panel_heading: string;
    panel_link: string;
    footer_background: string;
    footer_rule: string;
    footer_text: string;
    footer_link: string;
    avatar: string;
    newsletter_reason: string;
    dark: EmailDarkTheme;
  }

  const data: {
    brand: { primary: string; secondary: string; background: string };
    palette: {
      primary: string[];
      secondary: string[];
      grey: string[];
    };
    email_themes: {
      quill: EmailThemeSource;
      ldd: EmailThemeSource;
    };
  };

  export default data;
}

declare module "@/generated/passport-specialties.json" {
  // Merged from every file in shared/passport-specialties/ by
  // scripts/generate-json-from-yaml.ts, in filename order. A specialty
  // orders the passport's competency picker and nothing else.
  interface PassportSpecialty {
    id: string;
    display_name: string;
    common_competencies: string[];
  }

  const data: {
    specialties: PassportSpecialty[];
  };
  export default data;
}
