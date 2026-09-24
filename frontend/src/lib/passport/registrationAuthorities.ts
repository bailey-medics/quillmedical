/**
 * The professional registration bodies an assessor may name.
 *
 * The default jurisdiction's bodies from the shared config, the same list
 * the backend accepts, so the page offers exactly what the server will
 * take. Adding a body is a change to `shared/jurisdiction-config.yaml`.
 */

import jurisdictionConfig from "@/generated/jurisdiction-config.json";

/** One body, as a select option: its id, and a label naming it in full. */
export interface RegistrationAuthorityOption {
  value: string;
  label: string;
}

/** The registration bodies of the default jurisdiction, as options. */
export function registrationAuthorities(): RegistrationAuthorityOption[] {
  const { jurisdictions, default_jurisdiction: defaultId } = jurisdictionConfig;

  const registrations =
    jurisdictions[defaultId]?.professional_registrations ?? [];

  return registrations.map((registration) => ({
    value: registration.id,
    label: `${registration.id} — ${registration.display_name}`,
  }));
}
