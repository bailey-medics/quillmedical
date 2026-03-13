/**
 * Demo Letters Data
 *
 * Sample clinical letters for use in Storybook stories and component testing.
 * Provides realistic letter data with various subjects, authors, and dates.
 */

import type { LetterSummary } from "@/components/letters";

/** Array of sample clinical letters for demo purposes */
export const sampleLetters: LetterSummary[] = [
  {
    id: "l1",
    title: "Discharge summary: left knee",
    date: "2026-03-10",
    author: "Dr Sarah Johnson",
    authorRole: "Consultant Orthopaedic Surgeon",
    status: "final",
    summary:
      "Patient seen in clinic and referred for physiotherapy following successful arthroscopy.",
  },
  {
    id: "l2",
    title: "Letter: Investigations arranged",
    date: "2026-03-05",
    author: "James Wilson",
    authorRole: "Clinic Administrator",
    status: "draft",
    summary:
      "Bloods and stool sample arranged for next week as discussed in clinic.",
  },
];

export default sampleLetters;
