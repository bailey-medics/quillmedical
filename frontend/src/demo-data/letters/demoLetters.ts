import type { Letter } from "@/components/letters/Letters";

export const sampleLetters: Letter[] = [
  {
    id: "l1",
    subject: "Discharge summary: left knee",
    from: "Orthopaedics",
    date: new Date().toISOString(),
    snippet: "Patient seen in clinic and referred for physiotherapy...",
  },
  {
    id: "l2",
    subject: "Letter: Investigations arranged",
    from: "Clinic Admin",
    date: new Date().toISOString(),
    snippet: "Bloods and stool sample arranged for next week...",
  },
];

export default sampleLetters;
