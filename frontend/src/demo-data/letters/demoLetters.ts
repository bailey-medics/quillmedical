/**
 * Demo Letters Data
 *
 * Sample clinical letters for use in Storybook stories and component testing.
 * Provides realistic letter data with various subjects, authors, and dates.
 */

import type { Letter } from "@/components/letters";

/** Array of sample clinical letters for demo purposes */
export const sampleLetters: Letter[] = [
  {
    id: "l1",
    subject: "Discharge summary: left knee",
    from: "Orthopaedics",
    fromGivenName: "Sarah",
    fromFamilyName: "Johnson",
    gradientIndex: 0,
    date: new Date().toISOString(),
    snippet: "Patient seen in clinic and referred for physiotherapy...",
  },
  {
    id: "l2",
    subject: "Letter: Investigations arranged",
    from: "Clinic Admin",
    fromGivenName: "James",
    fromFamilyName: "Wilson",
    gradientIndex: 10,
    date: new Date().toISOString(),
    snippet: "Bloods and stool sample arranged for next week...",
  },
];

export default sampleLetters;
