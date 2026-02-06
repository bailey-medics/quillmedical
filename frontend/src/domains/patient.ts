/**
 * Patient Domain Model
 *
 * Type definitions for patient demographics and related data structures.
 * Used throughout the frontend for patient management and display.
 */

/**
 * Patient
 *
 * Represents a patient with demographic and contact information.
 * Mapped from FHIR R4 Patient resources retrieved from the backend.
 *
 * Note: Several fields (address, telephone, mobile, onQuill, nextOfKin) are
 * not currently populated from FHIR data. See SPEC.md for planned alignment
 * with FHIR R4 structures (Address, ContactPoint, Patient.contact).
 */
export type Patient = {
  /** FHIR Patient resource ID */
  id: string;
  /** Full name (concatenated given + family names) */
  name: string;
  /** Date of birth in YYYY-MM-DD format */
  dob?: string;
  /** Calculated age from date of birth */
  age?: number;
  /** Gender/sex (male, female, other, unknown) */
  sex?: string;
  /** National health identifier (e.g., NHS number, Medicare number) */
  nationalNumber?: string;
  /** FHIR system URL for the national identifier (used to determine display label) */
  nationalNumberSystem?: string;
  /** Residential address (not yet mapped from FHIR) */
  address?: string;
  /** Home telephone number (not yet mapped from FHIR) */
  telephone?: string;
  /** Mobile phone number (not yet mapped from FHIR) */
  mobile?: string;
  /** Whether patient is registered on Quill platform (not yet implemented) */
  onQuill?: boolean;
  /** Next of kin contact information (not yet mapped from FHIR) */
  nextOfKin?: {
    /** Next of kin full name */
    name?: string;
    /** Next of kin contact phone number */
    phone?: string;
  };
  /** ProfilePic gradient index (0-29) from FHIR extension */
  gradientIndex?: number;
};

/**
 * Get the display label for a national health identifier based on its FHIR system
 *
 * @param system - FHIR identifier system URL
 * @returns Display label (e.g., "NHS", "Medicare", "ID")
 */
export function getNationalNumberLabel(system?: string): string {
  if (!system) return "ID";

  if (system.includes("nhs.uk")) {
    return "NHS";
  }
  if (system.includes("medicare")) {
    return "Medicare";
  }
  if (system.includes("medicaid")) {
    return "Medicaid";
  }

  // Default to generic ID for unknown systems
  return "ID";
}
