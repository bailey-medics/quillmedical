import type { Letter } from "@/components/letters/Letters";

export const sampleLetters: Letter[] = [
  {
    id: "l1",
    subject: "Discharge summary: left knee",
    from: "Orthopaedics",
    fromGivenName: "Sarah",
    fromFamilyName: "Johnson",
    colorFrom: "#667eea",
    colorTo: "#764ba2",
    date: new Date().toISOString(),
    snippet: "Patient seen in clinic and referred for physiotherapy...",
  },
  {
    id: "l2",
    subject: "Letter: Investigations arranged",
    from: "Clinic Admin",
    fromGivenName: "James",
    fromFamilyName: "Wilson",
    colorFrom: "#4ECDC4",
    colorTo: "#44A08D",
    date: new Date().toISOString(),
    snippet: "Bloods and stool sample arranged for next week...",
  },
];

export default sampleLetters;
