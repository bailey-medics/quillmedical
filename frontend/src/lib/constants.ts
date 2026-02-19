/**
 * Application Constants
 *
 * Centralised configuration values used throughout the application.
 */

/**
 * FHIR Backend Polling Configuration
 *
 * These constants control how frequently the frontend checks the FHIR
 * backend for availability and data updates.
 */

/**
 * FHIR Polling Time (milliseconds)
 *
 * How often to check if the FHIR server is ready during initialisation.
 * Used when polling /patients or /health endpoints until fhir_ready is true.
 *
 * @default 5000 (5 seconds)
 */
export const FHIR_POLLING_TIME = 5000;

/**
 * FHIR Refresh Time (milliseconds)
 *
 * How often to automatically refresh patient data once FHIR is ready.
 * Used for keeping the patient list up-to-date with new additions.
 *
 * @default 30000 (30 seconds)
 */
export const FHIR_REFRESH_TIME = 30000;

/**
 * Responsive Layout Breakpoint
 *
 * Main breakpoint for switching between mobile and desktop layouts.
 * Below this width: Mobile layout with navigation drawer (hamburger menu)
 * Above this width: Desktop layout with side navigation panel
 *
 * Value: 48em = 768px
 *
 * This breakpoint is used throughout the application for:
 * - Side navigation visibility
 * - Responsive typography scaling
 * - Component layout adjustments
 * - Grid column changes
 *
 * @constant
 */
export const SM_BREAKPOINT = "48em"; // 768px - Small/Medium screen breakpoint
